import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

interface PaymentItem {
  nominal: number
  keterangan?: string
}

interface PaymentRequestBody {
  tanggal: string
  tipe: string
  sumberDana: string
  keteranganUtama?: string
  items: PaymentItem[]
}

interface AccurateAccount {
  id: number
  no: string
  name: string
}

const TIPE_KE_AKUN: Record<string, string> = {
  Kasbon: 'Piutang Karyawan',
  Upah: 'Hutang Gaji',
  'Uang Makan': 'Piutang Karyawan',
}

function normalisasiNama(teks: string): string {
  return teks.trim().replace(/\s+/g, ' ').toLowerCase()
}

function formatTanggalAccurate(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-')
  return `${dd}/${mm}/${yyyy}`
}

async function perbaruiAccessToken(refreshToken: string) {
  const clientId = process.env.NEXT_PUBLIC_ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://account.accurate.id/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error('Sesi token Accurate habis. Silakan klik tombol Accurate Terhubung > Hubungkan Ulang.')
  }

  return res.json()
}

async function bukaDatabaseAccurate(accessToken: string, existingDbId?: string | null) {
  let dbId = existingDbId || null

  if (!dbId) {
    const listRes = await fetch('https://account.accurate.id/api/db-list.do', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const listJson = await listRes.json()
    if (!listRes.ok || !listJson.s || !Array.isArray(listJson.d) || listJson.d.length === 0) {
      throw new Error('Database TB Putra Tunggal tidak ditemukan di akun Accurate ini.')
    }
    dbId = String(listJson.d[0].id)
  }

  const openRes = await fetch(
    `https://account.accurate.id/api/open-db.do?id=${encodeURIComponent(dbId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const openJson = await openRes.json()

  if (!openRes.ok || !openJson.s || !openJson.host || !openJson.session) {
    throw new Error('Gagal membuka sesi database Accurate Online.')
  }

  await supabase
    .from('accurate_tokens')
    .update({
      db_id: dbId,
      host: openJson.host,
      session: openJson.session,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  return {
    dbId,
    host: openJson.host as string,
    session: openJson.session as string,
  }
}

async function ambilSemuaAkunCOA(
  host: string,
  accessToken: string,
  session: string
): Promise<{ ok: boolean; accounts: AccurateAccount[] }> {
  const semuaAkun: AccurateAccount[] = []
  let totalHalaman = 1

  for (let page = 1; page <= totalHalaman && page <= 15; page++) {
    const url = `${host}/accurate/api/glaccount/list.do?fields=id,no,name&sp.pageSize=100&sp.page=${page}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Session-ID': session,
      },
    })

    if (!res.ok) {
      return { ok: false, accounts: [] }
    }

    const json = await res.json()
    if (!json.s || !Array.isArray(json.d)) {
      return { ok: false, accounts: [] }
    }

    semuaAkun.push(...(json.d as AccurateAccount[]))
    if (json.sp && typeof json.sp.pageCount === 'number') {
      totalHalaman = json.sp.pageCount
    }
  }

  return { ok: true, accounts: semuaAkun }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PaymentRequestBody
    const { tanggal, tipe, sumberDana, keteranganUtama, items } = body

    if (!tanggal || !tipe || !sumberDana || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Data transaksi belum lengkap untuk dikirim ke Accurate.' },
        { status: 400 }
      )
    }

    const namaAkunTujuan = TIPE_KE_AKUN[tipe]
    if (!namaAkunTujuan) {
      return NextResponse.json(
        { error: `Pemetaan akun untuk tipe transaksi "${tipe}" tidak dikenali.` },
        { status: 400 }
      )
    }

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('accurate_tokens')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (tokenErr || !tokenRow) {
      return NextResponse.json(
        { error: 'Accurate belum terhubung. Klik tombol Hubungkan Accurate di pojok kanan atas.' },
        { status: 401 }
      )
    }

    let accessToken: string = tokenRow.access_token
    let host: string | null = tokenRow.host
    let session: string | null = tokenRow.session

    const batasWaktu = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0
    if (batasWaktu - Date.now() < 5 * 60 * 1000 && tokenRow.refresh_token) {
      const refreshed = await perbaruiAccessToken(tokenRow.refresh_token)
      accessToken = refreshed.access_token
      const newExpiresAt = new Date(
        Date.now() + (refreshed.expires_in || 3600) * 1000
      ).toISOString()

      await supabase
        .from('accurate_tokens')
        .update({
          access_token: accessToken,
          refresh_token: refreshed.refresh_token || tokenRow.refresh_token,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
    }

    if (!host || !session) {
      const dbInfo = await bukaDatabaseAccurate(accessToken, tokenRow.db_id)
      host = dbInfo.host
      session = dbInfo.session
    }

    let coaResult = await ambilSemuaAkunCOA(host, accessToken, session)
    if (!coaResult.ok) {
      const dbInfo = await bukaDatabaseAccurate(accessToken, tokenRow.db_id)
      host = dbInfo.host
      session = dbInfo.session
      coaResult = await ambilSemuaAkunCOA(host, accessToken, session)
    }

    if (!coaResult.ok) {
      return NextResponse.json(
        { error: 'Gagal membaca Daftar Akun Perkiraan dari Accurate Online.' },
        { status: 500 }
      )
    }

    const akunBank = coaResult.accounts.find(
      (acc) => normalisasiNama(acc.name) === normalisasiNama(sumberDana)
    )
    if (!akunBank) {
      return NextResponse.json(
        { error: `Akun Kas/Bank "${sumberDana}" tidak ditemukan di Accurate Online. Pastikan penulisannya sama persis.` },
        { status: 400 }
      )
    }

    const akunPerkiraan = coaResult.accounts.find(
      (acc) => normalisasiNama(acc.name) === normalisasiNama(namaAkunTujuan)
    )
    if (!akunPerkiraan) {
      return NextResponse.json(
        { error: `Akun Perkiraan "${namaAkunTujuan}" tidak ditemukan di Accurate Online. Pastikan penulisannya sama persis.` },
        { status: 400 }
      )
    }

    const formParams = new URLSearchParams()
    formParams.append('bankNo', akunBank.no)
    formParams.append('transDate', formatTanggalAccurate(tanggal))

    // Catatan Utama di halaman Pembayaran > Info lainnya > Catatan
    if (keteranganUtama && keteranganUtama.trim() !== '') {
      formParams.append('description', keteranganUtama.trim())
    }

    // Rincian baris akun perkiraan (khusus Multi Nominal)
    items.forEach((item, idx) => {
      formParams.append(`detailAccount[${idx}].accountNo`, akunPerkiraan.no)
      formParams.append(`detailAccount[${idx}].amount`, String(item.nominal))
      if (item.keterangan && item.keterangan.trim() !== '') {
        const catatanBaris = item.keterangan.trim()
        formParams.append(`detailAccount[${idx}].memo`, catatanBaris)
        formParams.append(`detailAccount[${idx}].detailNotes`, catatanBaris)
        formParams.append(`detailAccount[${idx}].notes`, catatanBaris)
        formParams.append(`detailAccount[${idx}].description`, catatanBaris)
      }
    })

    const saveRes = await fetch(`${host}/accurate/api/other-payment/save.do`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Session-ID': session,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParams,
    })

    const saveJson = await saveRes.json()

    if (!saveRes.ok || !saveJson.s) {
      const pesanError = Array.isArray(saveJson.d)
        ? saveJson.d.join(', ')
        : 'Gagal menyimpan Pembayaran di Accurate Online.'
      return NextResponse.json({ error: pesanError, detail: saveJson }, { status: 400 })
    }

    const nomorBuktiAccurate = 
      saveJson.d?.number || 
      saveJson.r?.number || 
      saveJson.number || 
      saveJson.d?.no || 
      null

    return NextResponse.json({
      success: true,
      number: nomorBuktiAccurate,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan internal server.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}