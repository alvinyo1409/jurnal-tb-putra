import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.json(
      { error: 'Kode otorisasi dari Accurate tidak ditemukan.' },
      { status: 400 }
    )
  }

  const clientId = process.env.NEXT_PUBLIC_ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  const redirectUri = process.env.NEXT_PUBLIC_ACCURATE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Environment variables Accurate belum lengkap di server.' },
      { status: 500 }
    )
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const tokenResponse = await fetch('https://account.accurate.id/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: 'Gagal menukar token ke Accurate', detail: tokenData },
        { status: tokenResponse.status }
      )
    }

    const accessToken: string = tokenData.access_token
    const expiresAt = new Date(
      Date.now() + (tokenData.expires_in || 3600) * 1000
    ).toISOString()

    // Otomatis ambil dan buka satu-satunya database (TB Putra Tunggal)
    let dbId: string | null = null
    let host: string | null = null
    let session: string | null = null

    const dbListRes = await fetch('https://account.accurate.id/api/db-list.do', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const dbListJson = await dbListRes.json()

    if (dbListRes.ok && dbListJson.s && Array.isArray(dbListJson.d) && dbListJson.d.length > 0) {
      dbId = String(dbListJson.d[0].id)
      const openDbRes = await fetch(
        `https://account.accurate.id/api/open-db.do?id=${encodeURIComponent(dbId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const openDbJson = await openDbRes.json()
      if (openDbRes.ok && openDbJson.s) {
        host = openDbJson.host
        session = openDbJson.session
      }
    }

    const { error: dbError } = await supabase
      .from('accurate_tokens')
      .upsert({
        id: 1,
        access_token: accessToken,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        db_id: dbId,
        host,
        session,
        updated_at: new Date().toISOString(),
      })

    if (dbError) {
      return NextResponse.json(
        { error: 'Gagal menyimpan token ke Supabase', detail: dbError.message },
        { status: 500 }
      )
    }

    return NextResponse.redirect(new URL('/?accurate=connected', request.url))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat koneksi Accurate', detail: message },
      { status: 500 }
    )
  }
}