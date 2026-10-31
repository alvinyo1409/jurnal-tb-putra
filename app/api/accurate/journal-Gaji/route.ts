import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Sesuaikan 3 konstanta nama akun di bawah ini persis dengan nama Akun Perkiraan di Accurate Online Anda:
const AKUN_BEBAN_GAJI = "Beban Gaji, Upah & Honorer, Lembur";
const AKUN_PIUTANG_KARYAWAN = "Piutang Karyawan";
const AKUN_HUTANG_GAJI = "Hutang Gaji"; // <-- Ganti jika di Accurate Anda namanya "Utang Gaji" atau "Hutang Biaya"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function buatHeadersAccurate(accessToken: string, session?: string) {
  const timestamp = new Date().toISOString();
  const signatureSecret = process.env.ACCURATE_SIGNATURE_SECRET || "";
  const signature = crypto
    .createHmac("sha256", signatureSecret)
    .update(timestamp)
    .digest("base64");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "X-Api-Timestamp": timestamp,
    "X-Api-Signature": signature,
  };
  if (session) {
    headers["X-Session-ID"] = session;
  }
  return headers;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.NEXT_PUBLIC_ACCURATE_CLIENT_ID!;
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://account.accurate.id/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;
  return res.json();
}

async function cariNomorAkun(
  host: string,
  headers: Record<string, string>,
  namaAkun: string
): Promise<string> {
  const url = `${host}/accurate/api/glaccount/list.do?sp.pageSize=50&keywords=${encodeURIComponent(
    namaAkun
  )}&fields=id,no,name`;

  const res = await fetch(url, { method: "GET", headers });
  const json = await res.json();

  if (!json.s || !Array.isArray(json.d) || json.d.length === 0) {
    throw new Error(
      `Akun Perkiraan "${namaAkun}" tidak ditemukan di Accurate Online. Pastikan namanya sama persis.`
    );
  }

  const exact = json.d.find(
    (acc: { name: string; no: string }) =>
      acc.name.trim().toLowerCase() === namaAkun.trim().toLowerCase()
  );

  return exact ? exact.no : json.d[0].no;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      periode, // 'YYYY-MM'
      labelPeriode, // 'Oktober 2026'
      totalGapok,
      totalPotongan, // Uang Makan + Kasbon
      totalSisaGaji, // Gapok - Potongan
    } = body;

    if (!periode || Number(totalGapok) <= 0) {
      return NextResponse.json(
        { error: "Total Gapok harus lebih besar dari 0 untuk diposting." },
        { status: 400 }
      );
    }

    // 1. Ambil Token Accurate dari tabel accurate_tokens
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("accurate_tokens")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return NextResponse.json(
        { error: "Token Accurate belum terhubung. Silakan klik tombol Hubungkan Accurate." },
        { status: 401 }
      );
    }

    let accessToken: string = tokenRow.access_token;
    const host: string = tokenRow.host;
    const session: string | undefined = tokenRow.session || tokenRow.db_session || undefined;

    let headers = buatHeadersAccurate(accessToken, session);

    // Cek validitas token sekaligus cari kode akun Beban Gaji
    let noAkunBeban = "";
    try {
      noAkunBeban = await cariNomorAkun(host, headers, AKUN_BEBAN_GAJI);
    } catch {
      if (tokenRow.refresh_token) {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token);
        if (refreshed?.access_token) {
          accessToken = refreshed.access_token;
          await supabase
            .from("accurate_tokens")
            .update({
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token || tokenRow.refresh_token,
            })
            .eq("id", 1);
          headers = buatHeadersAccurate(accessToken, session);
          noAkunBeban = await cariNomorAkun(host, headers, AKUN_BEBAN_GAJI);
        } else {
          throw new Error("Sesi Accurate kedaluwarsa. Silakan Hubungkan Ulang Accurate.");
        }
      } else {
        throw new Error(
          `Gagal mengakses Accurate atau akun "${AKUN_BEBAN_GAJI}" tidak ditemukan.`
        );
      }
    }

    const noAkunPiutang =
      Number(totalPotongan) > 0
        ? await cariNomorAkun(host, headers, AKUN_PIUTANG_KARYAWAN)
        : "";
    const noAkunHutangGaji =
      Number(totalSisaGaji) !== 0
        ? await cariNomorAkun(host, headers, AKUN_HUTANG_GAJI)
        : "";

    // 2. Tentukan tanggal akhir bulan dalam format DD/MM/YYYY sesuai standar Accurate
    const [yearStr, monthStr] = periode.split("-");
    const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const transDate = `${String(lastDay).padStart(2, "0")}/${monthStr}/${yearStr}`;

    // 3. Susun baris Jurnal Umum (Debit & Kredit seimbang)
    const formParams = new URLSearchParams();
    formParams.append("transDate", transDate);
    formParams.append(
      "description",
      `Jurnal Akrual Gaji & Potongan Karyawan Periode ${labelPeriode}`
    );

    let idx = 0;

    // Baris 1 (DEBIT): Beban Gaji sebesar Total Gapok Utuh
    formParams.append(`detailJournalVoucher[${idx}].accountNo`, noAkunBeban);
    formParams.append(`detailJournalVoucher[${idx}].amount`, String(Number(totalGapok)));
    formParams.append(`detailJournalVoucher[${idx}].amountType`, "DEBIT");
    formParams.append(
      `detailJournalVoucher[${idx}].memo`,
      `Beban Gaji Utuh ${labelPeriode}`
    );
    idx++;

    // Baris 2 (CREDIT): Potong Piutang Karyawan (Uang Makan + Kasbon)
    if (Number(totalPotongan) > 0) {
      formParams.append(`detailJournalVoucher[${idx}].accountNo`, noAkunPiutang);
      formParams.append(`detailJournalVoucher[${idx}].amount`, String(Number(totalPotongan)));
      formParams.append(`detailJournalVoucher[${idx}].amountType`, "CREDIT");
      formParams.append(
        `detailJournalVoucher[${idx}].memo`,
        `Potongan Uang Makan & Kasbon ${labelPeriode}`
      );
      idx++;
    }

    // Baris 3: Sisa Gaji -> Masuk ke Hutang Gaji (CREDIT jika positif, DEBIT jika minus/lebih ambil)
    if (Number(totalSisaGaji) > 0) {
      formParams.append(`detailJournalVoucher[${idx}].accountNo`, noAkunHutangGaji);
      formParams.append(`detailJournalVoucher[${idx}].amount`, String(Number(totalSisaGaji)));
      formParams.append(`detailJournalVoucher[${idx}].amountType`, "CREDIT");
      formParams.append(
        `detailJournalVoucher[${idx}].memo`,
        `Sisa Hutang Gaji Karyawan ${labelPeriode}`
      );
    } else if (Number(totalSisaGaji) < 0) {
      formParams.append(`detailJournalVoucher[${idx}].accountNo`, noAkunHutangGaji);
      formParams.append(
        `detailJournalVoucher[${idx}].amount`,
        String(Math.abs(Number(totalSisaGaji)))
      );
      formParams.append(`detailJournalVoucher[${idx}].amountType`, "DEBIT");
      formParams.append(
        `detailJournalVoucher[${idx}].memo`,
        `Kelebihan Pengambilan atas Gaji ${labelPeriode}`
      );
    }

    // 4. Kirim ke Accurate endpoint journal-voucher/save.do
    const saveRes = await fetch(`${host}/accurate/api/journal-voucher/save.do`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formParams.toString(),
    });

    const saveJson = await saveRes.json();

    if (!saveJson.s) {
      const pesanErr = Array.isArray(saveJson.d)
        ? saveJson.d.join(", ")
        : JSON.stringify(saveJson.d || "Gagal menyimpan Jurnal Umum di Accurate.");
      return NextResponse.json({ error: pesanErr }, { status: 400 });
    }

    const noBukti = saveJson?.r?.number || saveJson?.d?.number || null;
    return NextResponse.json({ success: true, number: noBukti });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server jurnal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}