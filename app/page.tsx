"use client";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function Home() {
  // ================= STATE LOGIN =================
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userAktif, setUserAktif] = useState("");

  // ================= STATE ACCURATE =================
  const [accurateConnected, setAccurateConnected] = useState(false);

  // ================= STATE NAVIGASI VIEW =================
  const [activeView, setActiveView] = useState("form");

  // ================= STATE FORM UTAMA =================
  const [tanggal, setTanggal] = useState("");
  const [daftarPegawai, setDaftarPegawai] = useState<string[]>([]);
  const [pegawaiTerpilih, setPegawaiTerpilih] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [tipe, setTipe] = useState("");
  const [nominal, setNominal] = useState("");
  const [sumberDana, setSumberDana] = useState("");

  // Keterangan otomatis real-time untuk 1 pegawai
  const namaPegawaiSingle = pegawaiTerpilih.length === 1 ? pegawaiTerpilih[0] : "";
  const keteranganOtomatis =
    namaPegawaiSingle && tipe
      ? `Pengambilan ${tipe.toLowerCase()} a.n ${namaPegawaiSingle}`
      : "";

  // ================= STATE REPORT =================
  const [reportType, setReportType] = useState("");
  const [reportPeriod, setReportPeriod] = useState("");
  const [reportData, setReportData] = useState<any[]>([]);

  // ================= STATE FITUR GAJI & UPAH =================
  const [showGajiModal, setShowGajiModal] = useState(false);
  const [gajiPeriode, setGajiPeriode] = useState(""); // Format YYYY-MM
  const [gajiPegawaiModal, setGajiPegawaiModal] = useState<string[]>([]);
  const [showGajiDropdown, setShowGajiDropdown] = useState(false);

  const [gajiPegawaiAktif, setGajiPegawaiAktif] = useState<string[]>([]);
  const [gajiLabelPeriode, setGajiLabelPeriode] = useState("");
  const [gajiGapokMap, setGajiGapokMap] = useState<Record<string, string>>({});
  const [gajiPotonganMap, setGajiPotonganMap] = useState<
    Record<string, { uangMakan: number; kasbon: number }>
  >({});

  const isMultiPegawai = pegawaiTerpilih.length > 1;

  useEffect(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    setTanggal(`${yyyy}-${mm}-${dd}`);
    setGajiPeriode(`${yyyy}-${mm}`);

    const savedUser = sessionStorage.getItem("tb_putra_user");
    if (savedUser) {
      setUserAktif(savedUser);
      setIsLoggedIn(true);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("accurate") === "connected") {
      setAccurateConnected(true);
      Swal.fire({
        icon: "success",
        title: "Accurate Terhubung!",
        text: "Koneksi & izin modul Pembayaran Accurate Online siap digunakan.",
        confirmButtonColor: "#ffcc00",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      ambilDataPegawai();
      cekStatusAccurate();
    }
  }, [isLoggedIn]);

  const ambilDataPegawai = async () => {
    const { data, error } = await supabase.from("pegawai").select("nama").order("nama");
    if (!error && data) setDaftarPegawai(data.map((p) => p.nama));
  };

  const cekStatusAccurate = async () => {
    const { data, error } = await supabase
      .from("accurate_tokens")
      .select("id")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) {
      setAccurateConnected(true);
    }
  };

  const hubungkanAccurate = () => {
    const clientId = process.env.NEXT_PUBLIC_ACCURATE_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_ACCURATE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      Swal.fire(
        "Konfigurasi Belum Lengkap",
        "Client ID atau Redirect URI Accurate belum terbaca di server Vercel.",
        "error"
      );
      return;
    }

    const mulaiOtorisasi = () => {
      sessionStorage.setItem("tb_putra_user", userAktif);
      const scope = "other_payment_save other_payment_view glaccount_view";
      const authUrl = `https://account.accurate.id/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=${encodeURIComponent(scope)}`;
      window.location.href = authUrl;
    };

    if (accurateConnected) {
      Swal.fire({
        title: "Accurate Sudah Terhubung",
        text: "Ingin memperbarui izin scope atau menghubungkan ulang akun Accurate?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Hubungkan Ulang",
        cancelButtonText: "Batal",
        confirmButtonColor: "#ffcc00",
      }).then((res) => {
        if (res.isConfirmed) mulaiOtorisasi();
      });
    } else {
      mulaiOtorisasi();
    }
  };

  // ================= FUNGSI KIRIM KE ACCURATE =================
  const kirimKeAccurate = async (
    items: { nominal: number; keterangan?: string }[],
    keteranganUtama: string
  ) => {
    const response = await fetch("/api/accurate/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tanggal,
        tipe,
        sumberDana,
        keteranganUtama,
        items,
      }),
    });

    const resJson = await response.json();
    if (!response.ok) {
      throw new Error(resJson.error || "Gagal mengirim jurnal ke Accurate Online.");
    }
    return resJson.number as string | null;
  };

  // ================= FUNGSI LOGIN & FORM =================
  const loginAplikasi = async () => {
    if (!username || !password)
      return Swal.fire({ icon: "warning", title: "Perhatian", text: "Mohon isi Nama User dan Password!" });
    setIsLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username.toLowerCase())
      .eq("password", password)
      .single();
    setIsLoading(false);
    if (error || !data)
      return Swal.fire({ icon: "error", title: "Gagal", text: "User/Password salah!" });
    setUserAktif(data.username);
    sessionStorage.setItem("tb_putra_user", data.username);
    setIsLoggedIn(true);
    Swal.fire({
      icon: "success",
      title: "Berhasil",
      text: `Selamat datang, ${data.username}!`,
      timer: 1500,
      showConfirmButton: false,
    });
  };

  const logoutAplikasi = () => {
    sessionStorage.removeItem("tb_putra_user");
    setIsLoggedIn(false);
  };

  const formatAngkaRibuan = (val: string) => {
    const angka = val.replace(/[^0-9]/g, "");
    if (!angka) return "";
    return Number(angka).toLocaleString("id-ID");
  };

  const handleFormatRupiah = (val: string) => {
    setNominal(formatAngkaRibuan(val));
  };

  const togglePegawai = (nama: string) => {
    setPegawaiTerpilih((prev) => {
      const updated = prev.includes(nama)
        ? prev.filter((p) => p !== nama)
        : [...prev, nama];
      if (updated.length > 1) {
        setNominal("");
      }
      return updated;
    });
  };

  const resetForm = () => {
    setPegawaiTerpilih([]);
    setTipe("");
    setNominal("");
    setSumberDana("");
  };

  const tambahPegawaiBaru = () => {
    setShowDropdown(false);
    Swal.fire({
      title: "Tambah Pegawai",
      input: "text",
      inputPlaceholder: "Masukkan nama pegawai baru...",
      showCancelButton: true,
      confirmButtonText: "Tambah",
      cancelButtonText: "Batal",
      confirmButtonColor: "#ffcc00",
      preConfirm: (val) => {
        if (!val || val.trim() === "") {
          Swal.showValidationMessage("Nama pegawai tidak boleh kosong!");
          return false;
        }
        return val.trim();
      },
    }).then(async (res) => {
      if (res.isConfirmed && res.value) {
        Swal.fire({
          title: "Menyimpan...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });
        const { error } = await supabase.from("pegawai").insert({ nama: res.value });
        if (error) {
          Swal.fire("Gagal", error.message, "error");
        } else {
          Swal.fire({
            icon: "success",
            title: "Berhasil!",
            text: "Pegawai baru ditambahkan.",
            timer: 1500,
            showConfirmButton: false,
          });
          ambilDataPegawai();
        }
      }
    });
  };

  // ---------------- INPUT BIASA (1 PEGAWAI) ----------------
  const postData = async () => {
    if (isMultiPegawai) {
      return Swal.fire({
        icon: "info",
        title: "Gunakan + Multi Nominal",
        text: "Anda memilih lebih dari 1 pegawai. Silakan klik tombol + Multi Nominal untuk mengisi rincian tiap pegawai.",
        confirmButtonColor: "#ffcc00",
      });
    }

    if (!tanggal || pegawaiTerpilih.length === 0 || !tipe || !nominal || !sumberDana) {
      return Swal.fire({ icon: "warning", title: "Data Belum Lengkap", text: "Mohon isi semua kolom!" });
    }

    Swal.fire({
      title: "Memproses ke Accurate & Database...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const nomAngka = Number(nominal.replace(/[^0-9]/g, ""));
    const namaPegawai = pegawaiTerpilih[0];
    const finalKeterangan =
      keteranganOtomatis || `Pengambilan ${tipe.toLowerCase()} a.n ${namaPegawai}`;

    try {
      const noBukti = await kirimKeAccurate(
        [{ nominal: nomAngka, keterangan: "" }],
        finalKeterangan
      );

      const payload = [
        {
          tanggal,
          nama: namaPegawai,
          tipe,
          nominal: nomAngka,
          sumber_dana: sumberDana,
          keterangan: finalKeterangan,
          input_by: userAktif,
          no_bukti: noBukti || null,
        },
      ];

      const { error } = await supabase.from("transaksi").insert(payload);
      if (error) {
        Swal.fire("Tersimpan di Accurate, Gagal di Rekap Web", error.message, "warning");
      } else {
        Swal.fire(
          "Berhasil!",
          `Transaksi tersimpan di Web & Accurate${noBukti ? ` (No Bukti: ${noBukti})` : ""}.`,
          "success"
        );
        resetForm();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan koneksi Accurate.";
      Swal.fire("Gagal Kirim ke Accurate", msg, "error");
    }
  };

  // ---------------- FITUR MULTI NOMINAL ----------------
  const bukaMultiNominal = () => {
    if (!tanggal || pegawaiTerpilih.length === 0 || !tipe || !sumberDana) {
      return Swal.fire(
        "Perhatian",
        "Pilih Tanggal, Pegawai, Tipe Transaksi, dan Sumber Dana di form utama dulu!",
        "warning"
      );
    }

    let htmlTable = `
      <div style="max-height: 400px; overflow-y: auto; text-align: left;">
        <table class="table-multi">
          <thead><tr><th>Nama Pegawai</th><th width="140">Nominal</th><th>Ket.</th></tr></thead>
          <tbody>
    `;

    pegawaiTerpilih.forEach((nama, idx) => {
      htmlTable += `
        <tr>
          <td>${nama}</td>
          <td><input type="text" id="mn_nom_${idx}" class="form-control swal-nom" placeholder="0"></td>
          <td><input type="text" id="mn_ket_${idx}" class="form-control" value="Pengambilan ${tipe.toLowerCase()} a.n ${nama}"></td>
        </tr>
      `;
    });

    htmlTable += `
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #333;">
              <td style="font-weight:bold;">TOTAL</td>
              <td id="mn_total" style="font-weight:bold; font-size:1.1rem; color:#b38600;">0</td>
              <td><span style="font-size:0.8rem; color:#666;">(Ket. otomatis)</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    Swal.fire({
      title: "Multi Nominal",
      html: htmlTable,
      width: 700,
      showCancelButton: true,
      confirmButtonText: "POST DATA",
      cancelButtonText: "Batal",
      confirmButtonColor: "#ffcc00",
      didOpen: () => {
        document.querySelectorAll(".swal-nom").forEach((input) => {
          input.addEventListener("keyup", (e) => {
            let target = e.target as HTMLInputElement;
            let val = target.value.replace(/[^0-9]/g, "");
            target.value = val ? parseInt(val).toLocaleString("id-ID") : "";

            let total = 0;
            document.querySelectorAll(".swal-nom").forEach((inp) => {
              total += Number((inp as HTMLInputElement).value.replace(/[^0-9]/g, ""));
            });
            document.getElementById("mn_total")!.innerText = total.toLocaleString("id-ID");
          });
        });
      },
      preConfirm: () => {
        if (!sumberDana) {
          Swal.showValidationMessage("Sumber Dana di form utama belum dipilih!");
          return false;
        }
        let payloads = [];
        for (let i = 0; i < pegawaiTerpilih.length; i++) {
          const nom = (document.getElementById(`mn_nom_${i}`) as HTMLInputElement).value;
          const ket = (document.getElementById(`mn_ket_${i}`) as HTMLInputElement).value;
          if (!nom || nom === "0") {
            Swal.showValidationMessage(`Nominal untuk ${pegawaiTerpilih[i]} belum diisi!`);
            return false;
          }
          payloads.push({
            tanggal,
            nama: pegawaiTerpilih[i],
            tipe,
            nominal: Number(nom.replace(/[^0-9]/g, "")),
            sumber_dana: sumberDana,
            keterangan: ket,
            input_by: userAktif,
          });
        }
        return payloads;
      },
    }).then(async (result) => {
      if (result.isConfirmed && Array.isArray(result.value)) {
        Swal.fire({
          title: "Memproses Multi Data ke Accurate & Database...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        try {
          const accurateItems = result.value.map((row: { nominal: number; keterangan: string }) => ({
            nominal: row.nominal,
            keterangan: row.keterangan,
          }));

          const keteranganHeaderGabungan = `Pengambilan ${tipe.toLowerCase()} a.n ${pegawaiTerpilih.join(", ")}`;

          const noBukti = await kirimKeAccurate(accurateItems, keteranganHeaderGabungan);

          const payloadFinal = result.value.map((row: any) => ({
            ...row,
            no_bukti: noBukti || null,
          }));

          const { error } = await supabase.from("transaksi").insert(payloadFinal);
          if (error) {
            Swal.fire("Tersimpan di Accurate, Gagal di Rekap Web", error.message, "warning");
          } else {
            Swal.fire(
              "Berhasil!",
              `Semua data multi-nominal tersimpan di Web & Accurate${noBukti ? ` (No Bukti: ${noBukti})` : ""}!`,
              "success"
            );
            resetForm();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan koneksi Accurate.";
          Swal.fire("Gagal Kirim ke Accurate", msg, "error");
        }
      }
    });
  };

  // ================= FUNGSI FITUR GAJI & UPAH =================
  const togglePegawaiGajiModal = (nama: string) => {
    setGajiPegawaiModal((prev) =>
      prev.includes(nama) ? prev.filter((p) => p !== nama) : [...prev, nama]
    );
  };

  const togglePilihSemuaPegawaiGaji = () => {
    if (gajiPegawaiModal.length === daftarPegawai.length) {
      setGajiPegawaiModal([]);
    } else {
      setGajiPegawaiModal([...daftarPegawai]);
    }
  };

  const prosesBuatPerhitunganGaji = async () => {
    if (!gajiPeriode) {
      return Swal.fire({
        icon: "warning",
        title: "Periode Belum Dipilih",
        text: "Silakan tentukan Bulan & Tahun terlebih dahulu!",
        confirmButtonColor: "#ffcc00",
      });
    }

    if (gajiPegawaiModal.length === 0) {
      return Swal.fire({
        icon: "warning",
        title: "Pegawai Belum Dipilih",
        text: "Silakan pilih minimal 1 pegawai!",
        confirmButtonColor: "#ffcc00",
      });
    }

    const [yearStr, monthStr] = gajiPeriode.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const lastDayNum = new Date(year, month, 0).getDate();

    const tglDari = `${yearStr}-${monthStr}-01`;
    const tglKe = `${yearStr}-${monthStr}-${String(lastDayNum).padStart(2, "0")}`;
    const labelBulanTahun = `${NAMA_BULAN[month - 1]} ${year}`;

    Swal.fire({
      title: "Menarik Data Uang Makan & Kasbon...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const { data, error } = await supabase
      .from("transaksi")
      .select("nama, tipe, nominal")
      .gte("tanggal", tglDari)
      .lte("tanggal", tglKe)
      .in("nama", gajiPegawaiModal)
      .in("tipe", ["Uang Makan", "Kasbon"]);

    Swal.close();

    if (error) {
      return Swal.fire("Gagal Mengambil Data", error.message, "error");
    }

    // Urutkan pegawai sesuai urutan daftar pegawai yang dipilih
    const listPegawaiUrut = daftarPegawai.filter((p) => gajiPegawaiModal.includes(p));

    const initPotongan: Record<string, { uangMakan: number; kasbon: number }> = {};
    const initGapok: Record<string, string> = {};

    listPegawaiUrut.forEach((nama) => {
      initPotongan[nama] = { uangMakan: 0, kasbon: 0 };
      initGapok[nama] = "";
    });

    (data || []).forEach((item: any) => {
      if (initPotongan[item.nama]) {
        if (item.tipe === "Uang Makan") {
          initPotongan[item.nama].uangMakan += Number(item.nominal) || 0;
        } else if (item.tipe === "Kasbon") {
          initPotongan[item.nama].kasbon += Number(item.nominal) || 0;
        }
      }
    });

    setGajiPegawaiAktif(listPegawaiUrut);
    setGajiPotonganMap(initPotongan);
    setGajiGapokMap(initGapok);
    setGajiLabelPeriode(labelBulanTahun);
    setShowGajiDropdown(false);
    setShowGajiModal(false);
    setActiveView("gajiPage");
  };

  const handleUbahGapok = (nama: string, val: string) => {
    setGajiGapokMap((prev) => ({
      ...prev,
      [nama]: formatAngkaRibuan(val),
    }));
  };

  // ================= FUNGSI REPORT =================
  const bukaFilterTanggal = (jenis: string) => {
    Swal.fire({
      title: `Filter ${jenis === "REKAP" ? "Rekap" : "Detail"} Transaksi`,
      html: `
        <div style="text-align: left; margin: 10px 0;">
            <label style="font-weight:600; display:block; margin-bottom:5px;">Dari Tanggal:</label>
            <input type="date" id="swal_tgl_dari" class="swal2-input" style="width:90%; margin:0 0 15px 0;">
            <label style="font-weight:600; display:block; margin-bottom:5px;">Ke Tanggal:</label>
            <input type="date" id="swal_tgl_ke" class="swal2-input" style="width:90%; margin:0;">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "OK",
      confirmButtonColor: "#ffcc00",
      didOpen: () => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const lastDay = String(new Date(yyyy, now.getMonth() + 1, 0).getDate()).padStart(2, "0");
        (document.getElementById("swal_tgl_dari") as HTMLInputElement).value = `${yyyy}-${mm}-01`;
        (document.getElementById("swal_tgl_ke") as HTMLInputElement).value = `${yyyy}-${mm}-${lastDay}`;
      },
      preConfirm: () => {
        const dari = (document.getElementById("swal_tgl_dari") as HTMLInputElement).value;
        const ke = (document.getElementById("swal_tgl_ke") as HTMLInputElement).value;
        if (!dari || !ke) {
          Swal.showValidationMessage("Isi tanggal Dari dan Ke!");
          return false;
        }
        return { dari, ke };
      },
    }).then((res) => {
      if (res.isConfirmed) tarikDataReport(jenis, res.value.dari, res.value.ke);
    });
  };

  const tarikDataReport = async (jenis: string, dari: string, ke: string) => {
    Swal.fire({ title: "Memuat Laporan...", didOpen: () => Swal.showLoading() });
    const { data, error } = await supabase
      .from("transaksi")
      .select("*")
      .gte("tanggal", dari)
      .lte("tanggal", ke)
      .order("tanggal", { ascending: true });

    if (error) {
      Swal.fire("Error", error.message, "error");
    } else {
      Swal.close();
      setReportType(jenis);
      setReportPeriod(`${dari} s/d ${ke}`);
      setReportData(data || []);
      setActiveView("reportResult");
    }
  };

  // ================= KOMPONEN RENDER PERHITUNGAN GAJI =================
  const renderHalamanGaji = () => {
    // Bagi pegawai menjadi grup maksimal 4 kolom per baris
    const grupPegawai: string[][] = [];
    for (let i = 0; i < gajiPegawaiAktif.length; i += 4) {
      grupPegawai.push(gajiPegawaiAktif.slice(i, i + 4));
    }

    let totalSemuaGapok = 0;
    let totalSemuaUangMakan = 0;
    let totalSemuaKasbon = 0;

    gajiPegawaiAktif.forEach((nama) => {
      const gapokNum = Number((gajiGapokMap[nama] || "").replace(/[^0-9]/g, "")) || 0;
      const umNum = gajiPotonganMap[nama]?.uangMakan || 0;
      const ksbNum = gajiPotonganMap[nama]?.kasbon || 0;

      totalSemuaGapok += gapokNum;
      totalSemuaUangMakan += umNum;
      totalSemuaKasbon += ksbNum;
    });

    const totalSemuaSisaGaji = totalSemuaGapok - totalSemuaUangMakan - totalSemuaKasbon;

    return (
      <div
        id="gaji-page"
        style={{
          display: "block",
          backgroundColor: "#ffffff",
          width: "95%",
          maxWidth: "1280px",
          borderRadius: "10px",
          borderTop: "6px solid #ffcc00",
          padding: "35px 40px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header Perhitungan Gaji */}
        <div
          style={{
            textAlign: "center",
            borderBottom: "2px dashed #e0e0e0",
            paddingBottom: "18px",
            marginBottom: "28px",
          }}
        >
          <h2 style={{ margin: "0 0 6px 0", fontSize: "1.45rem", fontWeight: 800, color: "#1a1a1a" }}>
            Perhitungan Gaji & Upah
          </h2>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px" }}>
            TB Putra Tunggal
          </div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#555" }}>
            Per {gajiLabelPeriode}
          </div>
        </div>

        {/* Grid Pegawai (Maksimal 4 Pegawai per Baris) */}
        <div style={{ overflowX: "auto", paddingBottom: "10px" }}>
          {grupPegawai.map((kelompok, groupIdx) => (
            <div
              key={groupIdx}
              style={{
                display: "grid",
                gridTemplateColumns: "150px repeat(4, minmax(195px, 1fr))",
                columnGap: "18px",
                rowGap: "6px",
                alignItems: "center",
                marginBottom: groupIdx < grupPegawai.length - 1 ? "34px" : "10px",
                minWidth: "980px",
              }}
            >
              {/* BARIS 1: Nama Pegawai */}
              <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: "0.95rem", padding: "6px 0" }}>
                Nama Pegawai
              </div>
              {[0, 1, 2, 3].map((colIdx) => {
                const nama = kelompok[colIdx];
                return (
                  <div
                    key={`nama-${colIdx}`}
                    style={{
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#1a1a1a",
                      fontSize: "0.98rem",
                      padding: "6px 4px",
                    }}
                  >
                    {nama || ""}
                  </div>
                );
              })}

              {/* BARIS 2: Gapok Utuh (Input Manual) */}
              <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: "0.95rem" }}>
                Gapok Utuh
              </div>
              {[0, 1, 2, 3].map((colIdx) => {
                const nama = kelompok[colIdx];
                if (!nama) return <div key={`gapok-empty-${colIdx}`} />;
                return (
                  <div key={`gapok-${nama}`}>
                    <input
                      type="text"
                      placeholder="0"
                      value={gajiGapokMap[nama] || ""}
                      onChange={(e) => handleUbahGapok(nama, e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "6px 10px",
                        border: "1.5px solid #222",
                        borderRadius: "3px",
                        backgroundColor: "#ffffff",
                        textAlign: "right",
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        color: "#1a1a1a",
                      }}
                    />
                  </div>
                );
              })}

              {/* BARIS 3: Uang Makan (Otomatis) */}
              <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: "0.95rem" }}>
                Uang Makan
              </div>
              {[0, 1, 2, 3].map((colIdx) => {
                const nama = kelompok[colIdx];
                if (!nama) return <div key={`um-empty-${colIdx}`} />;
                const umVal = gajiPotonganMap[nama]?.uangMakan || 0;
                return (
                  <div
                    key={`um-${nama}`}
                    style={{
                      height: "36px",
                      padding: "6px 10px",
                      border: "1.5px solid #222",
                      borderRadius: "3px",
                      backgroundColor: "#d9d9d9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#dc2626",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                    }}
                  >
                    {umVal > 0 ? (
                      <>
                        <span>-</span>
                        <span>{umVal.toLocaleString("id-ID")}</span>
                      </>
                    ) : null}
                  </div>
                );
              })}

              {/* BARIS 4: Kasbon (Otomatis) */}
              <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: "0.95rem" }}>
                Kasbon
              </div>
              {[0, 1, 2, 3].map((colIdx) => {
                const nama = kelompok[colIdx];
                if (!nama) return <div key={`ksb-empty-${colIdx}`} />;
                const ksbVal = gajiPotonganMap[nama]?.kasbon || 0;
                return (
                  <div
                    key={`ksb-${nama}`}
                    style={{
                      height: "36px",
                      padding: "6px 10px",
                      border: "1.5px solid #222",
                      borderRadius: "3px",
                      backgroundColor: "#d9d9d9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#dc2626",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                    }}
                  >
                    {ksbVal > 0 ? (
                      <>
                        <span>-</span>
                        <span>{ksbVal.toLocaleString("id-ID")}</span>
                      </>
                    ) : null}
                  </div>
                );
              })}

              {/* BARIS 5: Total sisa gaji */}
              <div
                style={{
                  fontWeight: 700,
                  color: "#1a1a1a",
                  fontSize: "0.95rem",
                  marginTop: "8px",
                }}
              >
                Total sisa gaji
              </div>
              {[0, 1, 2, 3].map((colIdx) => {
                const nama = kelompok[colIdx];
                if (!nama) return <div key={`sisa-empty-${colIdx}`} />;
                const gapokNum =
                  Number((gajiGapokMap[nama] || "").replace(/[^0-9]/g, "")) || 0;
                const umVal = gajiPotonganMap[nama]?.uangMakan || 0;
                const ksbVal = gajiPotonganMap[nama]?.kasbon || 0;
                const sisa = gapokNum - umVal - ksbVal;
                const isMinus = sisa < 0;

                return (
                  <div
                    key={`sisa-${nama}`}
                    style={{
                      height: "40px",
                      marginTop: "8px",
                      padding: "6px 10px",
                      border: "1.5px solid #222",
                      borderRadius: "3px",
                      backgroundColor: "#fce4d6",
                      display: "flex",
                      justifyContent: isMinus ? "space-between" : "flex-end",
                      alignItems: "center",
                      color: isMinus ? "#dc2626" : "#111111",
                      fontWeight: 700,
                      fontSize: "0.98rem",
                    }}
                  >
                    {isMinus ? (
                      <>
                        <span>-</span>
                        <span>{Math.abs(sisa).toLocaleString("id-ID")}</span>
                      </>
                    ) : (
                      <span>{sisa.toLocaleString("id-ID")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bagian Bawah: Tabel TOTAL (Kiri Bawah) & Tombol Aksi (Kanan Bawah) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "30px",
            marginTop: "32px",
            paddingTop: "15px",
          }}
        >
          {/* Kotak TOTAL Keseluruhan */}
          <div style={{ width: "100%", maxWidth: "350px" }}>
            <div
              style={{
                border: "1.5px solid #222",
                borderBottom: "none",
                textAlign: "center",
                fontWeight: 700,
                padding: "7px 10px",
                backgroundColor: "#ffffff",
                color: "#1a1a1a",
                fontSize: "0.95rem",
              }}
            >
              TOTAL
            </div>

            {/* Total Gapok Utuh */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "145px 1fr",
                border: "1.5px solid #222",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  fontWeight: 700,
                  backgroundColor: "#fff",
                  borderRight: "1.5px solid #222",
                  fontSize: "0.92rem",
                }}
              >
                Gapok Utuh
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  backgroundColor: "#d9d9d9",
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                }}
              >
                {totalSemuaGapok.toLocaleString("id-ID")}
              </div>
            </div>

            {/* Total Uang Makan */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "145px 1fr",
                border: "1.5px solid #222",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  fontWeight: 700,
                  backgroundColor: "#fff",
                  borderRight: "1.5px solid #222",
                  fontSize: "0.92rem",
                }}
              >
                Uang Makan
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  backgroundColor: "#d9d9d9",
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                }}
              >
                <span>{totalSemuaUangMakan > 0 ? "-" : ""}</span>
                <span>{totalSemuaUangMakan.toLocaleString("id-ID")}</span>
              </div>
            </div>

            {/* Total Kasbon */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "145px 1fr",
                border: "1.5px solid #222",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  fontWeight: 700,
                  backgroundColor: "#fff",
                  borderRight: "1.5px solid #222",
                  fontSize: "0.92rem",
                }}
              >
                Kasbon
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  backgroundColor: "#d9d9d9",
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                }}
              >
                <span>{totalSemuaKasbon > 0 ? "-" : ""}</span>
                <span>{totalSemuaKasbon.toLocaleString("id-ID")}</span>
              </div>
            </div>

            {/* Total Sisa Gaji */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "145px 1fr",
                border: "1.5px solid #222",
              }}
            >
              <div
                style={{
                  padding: "7px 10px",
                  fontWeight: 700,
                  backgroundColor: "#fff",
                  borderRight: "1.5px solid #222",
                  fontSize: "0.92rem",
                }}
              >
                Total sisa gaji
              </div>
              <div
                style={{
                  padding: "7px 10px",
                  backgroundColor: "#d9d9d9",
                  display: "flex",
                  justifyContent: totalSemuaSisaGaji < 0 ? "space-between" : "flex-end",
                  fontWeight: 800,
                  color: totalSemuaSisaGaji < 0 ? "#dc2626" : "#111",
                  fontSize: "0.96rem",
                }}
              >
                {totalSemuaSisaGaji < 0 ? (
                  <>
                    <span>-</span>
                    <span>{Math.abs(totalSemuaSisaGaji).toLocaleString("id-ID")}</span>
                  </>
                ) : (
                  <span>{totalSemuaSisaGaji.toLocaleString("id-ID")}</span>
                )}
              </div>
            </div>
          </div>

          {/* Tombol POST & Kembali */}
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-kuning"
              style={{ width: "145px", height: "48px", borderRadius: "10px", fontWeight: 700 }}
              onClick={() =>
                Swal.fire({
                  icon: "info",
                  title: "Segera Hadir",
                  text: "Fungsi POST Gaji akan diaktifkan pada tahap selanjutnya.",
                  confirmButtonColor: "#ffcc00",
                })
              }
            >
              POST
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: "145px", height: "48px", borderRadius: "10px", fontWeight: 700 }}
              onClick={() => setActiveView("form")}
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ================= KOMPONEN RENDER REPORT =================
  const renderTabelRekap = () => {
    if (reportData.length === 0)
      return (
        <p style={{ textAlign: "center", padding: "30px", color: "#777" }}>
          Tidak ada transaksi pada periode ini.
        </p>
      );

    const listPegawai = Array.from(new Set(reportData.map((d) => d.nama))).sort() as string[];
    const rekap: any = { "Uang Makan": {}, Kasbon: {}, Upah: {} };

    listPegawai.forEach((peg) => {
      rekap["Uang Makan"][peg] = 0;
      rekap["Kasbon"][peg] = 0;
      rekap["Upah"][peg] = 0;
    });

    reportData.forEach((item) => {
      if (rekap[item.tipe] !== undefined) {
        rekap[item.tipe][item.nama] += Number(item.nominal);
      }
    });

    const komponenList = [
      { key: "Uang Makan", label: "Total Uang makan" },
      { key: "Kasbon", label: "Total Kasbon" },
      { key: "Upah", label: "Total Pengambilan gaji" },
    ];

    let grandTotalKolom: any = {};
    listPegawai.forEach((peg) => (grandTotalKolom[peg] = 0));
    let absoluteTotal = 0;

    return (
      <div className="report-table-wrapper">
        <table className="table-report">
          <thead>
            <tr>
              <th>Komponen</th>
              {listPegawai.map((peg) => (
                <th key={peg}>{peg}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {komponenList.map((comp) => {
              let totalBaris = 0;
              return (
                <tr key={comp.key}>
                  <td style={{ fontWeight: 600 }}>{comp.label}</td>
                  {listPegawai.map((peg) => {
                    let val = rekap[comp.key][peg] || 0;
                    totalBaris += val;
                    grandTotalKolom[peg] += val;
                    return <td key={peg}>{val > 0 ? val.toLocaleString("id-ID") : "-"}</td>;
                  })}
                  <td style={{ fontWeight: "bold" }}>
                    {totalBaris > 0 ? totalBaris.toLocaleString("id-ID") : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: "bold" }}>TOTAL KESELURUHAN</td>
              {listPegawai.map((peg) => {
                absoluteTotal += grandTotalKolom[peg];
                return (
                  <td key={peg}>
                    {grandTotalKolom[peg] > 0 ? grandTotalKolom[peg].toLocaleString("id-ID") : "-"}
                  </td>
                );
              })}
              <td style={{ color: "#b38600" }}>
                {absoluteTotal > 0 ? absoluteTotal.toLocaleString("id-ID") : "-"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const renderTabelDetail = () => {
    if (reportData.length === 0)
      return (
        <p style={{ textAlign: "center", padding: "30px", color: "#777" }}>
          Tidak ada transaksi pada periode ini.
        </p>
      );

    const listPegawai = Array.from(new Set(reportData.map((d) => d.nama))).sort() as string[];
    const kategoriMap = [
      { key: "Uang Makan", label: "Uang Makan" },
      { key: "Kasbon", label: "Kasbon" },
      { key: "Upah", label: "Pengambilan Gaji" },
    ];

    return (
      <>
        {kategoriMap.map((kat) => {
          let filteredData = reportData.filter((item) => item.tipe === kat.key);
          if (filteredData.length === 0) return null;

          let groupedByDate: any = {};
          filteredData.forEach((item) => {
            if (!groupedByDate[item.tanggal]) groupedByDate[item.tanggal] = {};
            if (!groupedByDate[item.tanggal][item.nama]) groupedByDate[item.tanggal][item.nama] = 0;
            groupedByDate[item.tanggal][item.nama] += Number(item.nominal);
          });

          let tanggalList = Object.keys(groupedByDate).sort();
          let subTotalKolom: any = {};
          listPegawai.forEach((peg) => (subTotalKolom[peg] = 0));
          let grandTotalKategori = 0;

          return (
            <div key={kat.key}>
              <div className="report-section-title">{kat.label}</div>
              <div className="report-table-wrapper">
                <table className="table-report">
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }}>Tanggal</th>
                      {listPegawai.map((peg) => (
                        <th key={peg}>{peg}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tanggalList.map((tgl) => {
                      let totalBarisHarian = 0;
                      return (
                        <tr key={tgl}>
                          <td style={{ textAlign: "center", fontWeight: 500 }}>{tgl}</td>
                          {listPegawai.map((peg) => {
                            let val = groupedByDate[tgl][peg] || 0;
                            totalBarisHarian += val;
                            subTotalKolom[peg] += val;
                            return <td key={peg}>{val > 0 ? val.toLocaleString("id-ID") : "-"}</td>;
                          })}
                          <td style={{ fontWeight: "bold" }}>
                            {totalBarisHarian > 0 ? totalBarisHarian.toLocaleString("id-ID") : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: "bold", textAlign: "center" }}>SUBTOTAL</td>
                      {listPegawai.map((peg) => {
                        grandTotalKategori += subTotalKolom[peg];
                        return (
                          <td key={peg}>
                            {subTotalKolom[peg] > 0 ? subTotalKolom[peg].toLocaleString("id-ID") : "-"}
                          </td>
                        );
                      })}
                      <td style={{ color: "#b38600" }}>
                        {grandTotalKategori > 0 ? grandTotalKategori.toLocaleString("id-ID") : "-"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  // ================= RENDER UTAMA BERDASARKAN VIEW =================
  if (!isLoggedIn) {
    return (
      <div id="cover-page">
        <div className="logo-area">
          <img
            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3FzdCmS3-ml79odLqkbtykQ5WGIpIg3ftxfb7TD1Z1Q&s=10"
            alt="Logo"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <h1 className="cover-title">Sistem Integrasi Jurnal Kasbon & Gaji</h1>
        <p className="cover-subtitle">
          Ekstensi Auto-Jurnal via API Accurate untuk Transaksi Kasbon, Uang Makan, dan Gaji Karyawan
        </p>
        <div className="login-box">
          <h3>Login Akses</h3>
          <div className="login-field">
            <label>Nama User</label>
            <input
              type="text"
              placeholder="Masukkan Nama User"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Masukkan Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loginAplikasi()}
            />
          </div>
          <button
            className="btn btn-kuning"
            style={{ marginTop: "5px", width: "100%" }}
            onClick={loginAplikasi}
            disabled={isLoading}
          >
            {isLoading ? "Memeriksa..." : "Login & Mulai Input"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ---------------- POP-UP MODAL: INPUT GAJI / UPAH ---------------- */}
      {showGajiModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
            padding: "16px",
          }}
          onClick={() => {
            setShowGajiDropdown(false);
            setShowGajiModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              width: "100%",
              maxWidth: "520px",
              borderRadius: "10px",
              borderTop: "6px solid #ffcc00",
              padding: "28px 32px",
              boxShadow: "0 15px 35px rgba(0,0,0,0.25)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {showGajiDropdown && (
              <div
                style={{ position: "fixed", inset: 0, zIndex: 1000 }}
                onClick={() => setShowGajiDropdown(false)}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "2px dashed #e0e0e0",
                paddingBottom: "12px",
                marginBottom: "22px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#1a1a1a" }}>
                Input Gaji / Upah
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowGajiDropdown(false);
                  setShowGajiModal(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.4rem",
                  cursor: "pointer",
                  color: "#666",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Pilihan Bulan & Tahun */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "18px",
                gap: "12px",
              }}
            >
              <label style={{ width: "130px", flex: "0 0 130px", fontWeight: 600, color: "#333" }}>
                Periode
              </label>
              <input
                type="month"
                className="form-control"
                style={{ height: "42px", width: "100%" }}
                value={gajiPeriode}
                onChange={(e) => setGajiPeriode(e.target.value)}
              />
            </div>

            {/* Pilihan Multi-Select Nama Pegawai */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "26px",
                gap: "12px",
              }}
            >
              <label style={{ width: "130px", flex: "0 0 130px", fontWeight: 600, color: "#333" }}>
                Nama Pegawai
              </label>
              <div className="multi-select-container" style={{ flex: 1, zIndex: 1001 }}>
                <div
                  className="multi-select-header"
                  onClick={() => setShowGajiDropdown(!showGajiDropdown)}
                >
                  {gajiPegawaiModal.length === 0
                    ? "-- Pilih Pegawai --"
                    : gajiPegawaiModal.length === 1
                    ? gajiPegawaiModal[0]
                    : `${gajiPegawaiModal.length} Pegawai Dipilih`}
                </div>
                {showGajiDropdown && (
                  <div
                    className="multi-select-options"
                    style={{ display: "block", maxHeight: "230px", overflowY: "auto" }}
                  >
                    {daftarPegawai.length > 0 && (
                      <label
                        style={{
                          borderBottom: "1px solid #eee",
                          fontWeight: 700,
                          backgroundColor: "#fafafa",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            daftarPegawai.length > 0 &&
                            gajiPegawaiModal.length === daftarPegawai.length
                          }
                          onChange={togglePilihSemuaPegawaiGaji}
                        />{" "}
                        Pilih Semua Pegawai
                      </label>
                    )}
                    {daftarPegawai.map((nama) => (
                      <label key={nama}>
                        <input
                          type="checkbox"
                          checked={gajiPegawaiModal.includes(nama)}
                          onChange={() => togglePegawaiGajiModal(nama)}
                        />{" "}
                        {nama}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tombol Buat */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: "110px" }}
                onClick={() => {
                  setShowGajiDropdown(false);
                  setShowGajiModal(false);
                }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-kuning"
                style={{ width: "130px" }}
                onClick={prosesBuatPerhitunganGaji}
              >
                Buat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- VIEW: FORM UTAMA ---------------- */}
      {activeView === "form" && (
        <div id="form-page" style={{ display: "block", position: "relative" }}>
          {showDropdown && (
            <div
              style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }}
              onClick={() => setShowDropdown(false)}
            />
          )}
          <div
            className="top-bar"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span>
              User Aktif: <strong>{userAktif}</strong>
            </span>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                type="button"
                onClick={hubungkanAccurate}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: accurateConnected ? "1px solid #16a34a" : "1px solid #ffcc00",
                  backgroundColor: accurateConnected ? "#dcfce7" : "#1a1a1a",
                  color: accurateConnected ? "#15803d" : "#ffcc00",
                }}
              >
                {accurateConnected ? "✓ Accurate Terhubung" : "Hubungkan Accurate"}
              </button>
              <button type="button" className="btn-logout" onClick={logoutAplikasi}>
                Logout
              </button>
            </div>
          </div>
          <div className="form-header">
            <h2>Form Inputan Transaksi</h2>
          </div>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-row date-container">
              <div className="form-group">
                <label>Tanggal</label>
                <input
                  type="date"
                  className="form-control"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ fontWeight: 600, width: "140px", flex: "0 0 140px", color: "#333" }}>
                  Nama Pegawai
                </label>
                <div className="multi-select-container" style={{ zIndex: 10 }}>
                  <div className="multi-select-header" onClick={() => setShowDropdown(!showDropdown)}>
                    {pegawaiTerpilih.length === 0
                      ? "-- Pilih Pegawai --"
                      : pegawaiTerpilih.length === 1
                      ? pegawaiTerpilih[0]
                      : `${pegawaiTerpilih.length} Pegawai Dipilih`}
                  </div>
                  {showDropdown && (
                    <div className="multi-select-options" style={{ display: "block" }}>
                      {daftarPegawai.map((nama) => (
                        <label key={nama}>
                          <input
                            type="checkbox"
                            checked={pegawaiTerpilih.includes(nama)}
                            onChange={() => togglePegawai(nama)}
                          />{" "}
                          {nama}
                        </label>
                      ))}
                      <div className="opsi-tambah-btn" onClick={tambahPegawaiBaru}>
                        + Tambah Pegawai Baru
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* --- BARIS 1: Tipe Transaksi & Nominal --- */}
            <div className="form-row" style={{ alignItems: "center", marginBottom: "15px" }}>
              <div className="form-group" style={{ alignItems: "center", marginRight: "25px" }}>
                <label style={{ width: "140px", flex: "0 0 140px" }}>Tipe Transaksi</label>
                <select
                  className="form-control"
                  style={{ height: "42px" }}
                  value={tipe}
                  onChange={(e) => setTipe(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    -- Pilih Transaksi --
                  </option>
                  <option value="Kasbon">Kasbon</option>
                  <option value="Uang Makan">Uang Makan</option>
                  <option value="Upah">Pengambilan Gaji / Upah</option>
                </select>
              </div>
              <div className="form-group" style={{ alignItems: "center", marginRight: "0" }}>
                <label style={{ width: "80px", flex: "0 0 80px" }}>Nominal</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={isMultiPegawai ? "Klik + Multi Nominal" : "0"}
                  disabled={isMultiPegawai}
                  style={{
                    height: "42px",
                    width: "100%",
                    backgroundColor: isMultiPegawai ? "#e9ecef" : "#fff",
                    cursor: isMultiPegawai ? "not-allowed" : "text",
                  }}
                  value={nominal}
                  onChange={(e) => handleFormatRupiah(e.target.value)}
                  required={!isMultiPegawai}
                />
              </div>
            </div>

            {/* --- BARIS 2: Sumber Dana --- */}
            <div className="form-row" style={{ marginBottom: "15px" }}>
              <div className="form-group">
                <label style={{ width: "140px", flex: "0 0 140px" }}>Sumber Dana</label>
                <select
                  className="form-control"
                  style={{ height: "42px" }}
                  value={sumberDana}
                  onChange={(e) => setSumberDana(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    -- Pilih Sumber Dana --
                  </option>
                  <option value="Kas Kasir 1">Kas Kasir 1</option>
                  <option value="Kas Kasir 2">Kas Kasir 2</option>
                  <option value="Kas Besar">Kas Besar</option>
                  <option value="BCA 8688">BCA 8688</option>
                </select>
              </div>
            </div>

            {/* --- BARIS 3: Tombol Multi Nominal di Kanan --- */}
            <div className="form-row" style={{ alignItems: "center", marginBottom: "15px" }}>
              <div className="form-group" style={{ marginRight: "25px", visibility: "hidden" }}>
                <label style={{ width: "140px", flex: "0 0 140px" }}></label>
                <div className="form-control" style={{ width: "100%" }}></div>
              </div>
              <div className="form-group" style={{ alignItems: "center", marginRight: "0" }}>
                <label style={{ width: "80px", flex: "0 0 80px" }}></label>
                <button
                  type="button"
                  className="btn-multi"
                  style={{
                    height: "38px",
                    width: "100%",
                    margin: 0,
                    backgroundColor: "#1a1a1a",
                    color: "#ffcc00",
                    fontWeight: "bold",
                  }}
                  onClick={bukaMultiNominal}
                >
                  + Multi Nominal
                </button>
              </div>
            </div>

            <div className="form-row" style={{ alignItems: "flex-start", marginTop: "10px" }}>
              <label
                style={{
                  width: "140px",
                  flex: "0 0 140px",
                  fontWeight: 600,
                  color: "#333",
                  marginTop: "10px",
                }}
              >
                Keterangan
              </label>
              <div className="keterangan-wrapper" style={{ flex: 1 }}>
                <textarea
                  className="form-control"
                  placeholder={
                    isMultiPegawai
                      ? "Multi keterangan otomatis terisi saat POST DATA di + Multi Nominal..."
                      : "Keterangan terisi otomatis..."
                  }
                  disabled={true}
                  style={{
                    backgroundColor: "#e9ecef",
                    cursor: "not-allowed",
                    width: "100%",
                  }}
                  value={
                    isMultiPegawai
                      ? "(Multi keterangan diatur di dalam + Multi Nominal)"
                      : keteranganOtomatis
                  }
                />
              </div>
            </div>

            {/* --- BARIS TOMBOL AKSI + TOMBOL BULAT KALKULATOR GAJI --- */}
            <div
              className="action-buttons"
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="btn btn-kuning"
                style={{ width: "140px", opacity: isMultiPegawai ? 0.5 : 1 }}
                onClick={postData}
              >
                Post
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: "140px" }}
                onClick={resetForm}
              >
                Hapus
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  width: "140px",
                  backgroundColor: "#1a1a1a",
                  color: "#fff",
                  border: "2px solid #ffcc00",
                }}
                onClick={() => setActiveView("reportMenu")}
              >
                Report
              </button>

              {/* Tombol Bulat Kalkulator Gaji di Sebelah Kanan Report */}
              <button
                type="button"
                title="Perhitungan Gaji & Upah"
                onClick={() => setShowGajiModal(true)}
                style={{
                  position: "absolute",
                  right: "0",
                  width: "46px",
                  height: "46px",
                  borderRadius: "50%",
                  backgroundColor: "#1a1a1a",
                  border: "2px solid #ffcc00",
                  color: "#ffcc00",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
                  transition: "transform 0.15s ease",
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.07)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <line x1="8" y1="6" x2="16" y2="6" />
                  <line x1="16" y1="14" x2="16" y2="18" />
                  <path d="M16 10h.01" />
                  <path d="M12 10h.01" />
                  <path d="M8 10h.01" />
                  <path d="M12 14h.01" />
                  <path d="M8 14h.01" />
                  <path d="M12 18h.01" />
                  <path d="M8 18h.01" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- VIEW: PERHITUNGAN GAJI & UPAH ---------------- */}
      {activeView === "gajiPage" && renderHalamanGaji()}

      {/* ---------------- VIEW: MENU REPORT ---------------- */}
      {activeView === "reportMenu" && (
        <div
          id="report-menu-page"
          style={{
            display: "block",
            backgroundColor: "#ffffff",
            width: "100%",
            maxWidth: "800px",
            borderRadius: "10px",
            borderTop: "6px solid #ffcc00",
            padding: "35px 40px",
          }}
        >
          <div className="form-header">
            <h2>Menu Laporan Transaksi</h2>
          </div>
          <div className="report-menu-container">
            <button className="btn-report-menu" onClick={() => bukaFilterTanggal("REKAP")}>
              Rekap Transaksi
            </button>
            <button className="btn-report-menu" onClick={() => bukaFilterTanggal("DETAIL")}>
              Detail Transaksi
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setActiveView("form")}
              style={{ marginTop: "10px" }}
            >
              Kembali ke Form Input
            </button>
          </div>
        </div>
      )}

      {/* ---------------- VIEW: HASIL REPORT ---------------- */}
      {activeView === "reportResult" && (
        <div
          id="report-result-page"
          style={{
            display: "block",
            backgroundColor: "#ffffff",
            width: "95%",
            maxWidth: "1450px",
            borderRadius: "10px",
            borderTop: "6px solid #ffcc00",
            padding: "35px 40px",
          }}
        >
          <div className="top-bar">
            <span>
              Periode: <strong>{reportPeriod}</strong>
            </span>
            <button
              type="button"
              className="btn-logout"
              onClick={() => setActiveView("reportMenu")}
            >
              Kembali ke Menu Report
            </button>
          </div>
          <div className="form-header">
            <h2>{reportType === "REKAP" ? "Rekap Transaksi" : "Rekap Detail Transaksi"}</h2>
          </div>

          {reportType === "REKAP" ? renderTabelRekap() : renderTabelDetail()}
        </div>
      )}
    </>
  );
}