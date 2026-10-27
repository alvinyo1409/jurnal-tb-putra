"use client";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { supabase } from "@/lib/supabase";

export default function Home() {
  // ================= STATE LOGIN =================
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userAktif, setUserAktif] = useState("");

  // ================= STATE NAVIGASI VIEW =================
  // Mengatur layar mana yang tampil: "form", "reportMenu", atau "reportResult"
  const [activeView, setActiveView] = useState("form");

  // ================= STATE FORM UTAMA =================
  // PERBAIKAN: Set tanggal jadi string kosong agar aman saat proses build di Vercel
  const [tanggal, setTanggal] = useState(""); 
  const [daftarPegawai, setDaftarPegawai] = useState<string[]>([]);
  const [pegawaiTerpilih, setPegawaiTerpilih] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [tipe, setTipe] = useState("");
  const [nominal, setNominal] = useState("");
  const [sumberDana, setSumberDana] = useState("");
  const [keterangan, setKeterangan] = useState("");

  // ================= STATE REPORT =================
  const [reportType, setReportType] = useState(""); // "REKAP" atau "DETAIL"
  const [reportPeriod, setReportPeriod] = useState("");
  const [reportData, setReportData] = useState<any[]>([]);

  // PERBAIKAN: Set tanggal saat aplikasi baru dimuat di browser pengguna
  useEffect(() => {
    setTanggal(new Date().toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (isLoggedIn) ambilDataPegawai();
  }, [isLoggedIn]);

  const ambilDataPegawai = async () => {
    const { data, error } = await supabase.from("pegawai").select("nama").order("nama");
    if (!error && data) setDaftarPegawai(data.map((p) => p.nama));
  };

  // ================= FUNGSI LOGIN & FORM =================
  const loginAplikasi = async () => {
    if (!username || !password) return Swal.fire({ icon: "warning", title: "Perhatian", text: "Mohon isi Nama User dan Password!" });
    setIsLoading(true);
    const { data, error } = await supabase.from("users").select("*").eq("username", username.toLowerCase()).eq("password", password).single();
    setIsLoading(false);
    if (error || !data) return Swal.fire({ icon: "error", title: "Gagal", text: "User/Password salah!" });
    setUserAktif(data.username);
    setIsLoggedIn(true);
    Swal.fire({ icon: "success", title: "Berhasil", text: `Selamat datang, ${data.username}!`, timer: 1500, showConfirmButton: false });
  };

  const handleFormatRupiah = (val: string) => {
    let angka = val.replace(/[^,\d]/g, "");
    let sisa = angka.length % 3;
    let rupiah = angka.substring(0, sisa);
    let ribuan = angka.substring(sisa).match(/\d{3}/gi);
    if (ribuan) rupiah += (sisa ? "." : "") + ribuan.join(".");
    setNominal(rupiah);
  };

  const togglePegawai = (nama: string) => {
    setPegawaiTerpilih(prev => prev.includes(nama) ? prev.filter(p => p !== nama) : [...prev, nama]);
  };

  const resetForm = () => { setPegawaiTerpilih([]); setTipe(""); setNominal(""); setSumberDana(""); setKeterangan(""); };

  const tambahPegawaiBaru = () => {
    setShowDropdown(false);
    Swal.fire({
      title: 'Tambah Pegawai', input: 'text', showCancelButton: true, confirmButtonText: 'Tambah', confirmButtonColor: '#ffcc00',
      preConfirm: (val) => !val && Swal.showValidationMessage('Nama tidak boleh kosong!')
    }).then(async (res) => {
      if (res.isConfirmed) {
        Swal.fire({ title: 'Menyimpan...', didOpen: () => Swal.showLoading() });
        await supabase.from('pegawai').insert({ nama: res.value.trim() });
        Swal.fire({ icon: 'success', title: 'Berhasil!', timer: 1500 });
        ambilDataPegawai();
      }
    });
  };

  const postData = async () => {
    if (!tanggal || pegawaiTerpilih.length === 0 || !tipe || !nominal || !sumberDana) return Swal.fire({ icon: "warning", title: "Data Belum Lengkap", text: "Mohon isi semua kolom!" });
    Swal.fire({ title: "Menyimpan...", didOpen: () => Swal.showLoading() });
    const nomAngka = Number(nominal.replace(/[^0-9]/g, ""));
    const payload = pegawaiTerpilih.map((nama) => ({
      tanggal, nama, tipe, nominal: nomAngka, sumber_dana: sumberDana, keterangan: keterangan || `Pengambilan ${tipe.toLowerCase()} a.n ${nama}`, input_by: userAktif
    }));
    const { error } = await supabase.from("transaksi").insert(payload);
    if (error) Swal.fire("Gagal", error.message, "error");
    else { Swal.fire("Berhasil", "Data tersimpan.", "success"); resetForm(); }
  };

  // ---------------- FITUR MULTI NOMINAL ----------------
  const bukaMultiNominal = () => {
    if (pegawaiTerpilih.length === 0 || !tipe) return Swal.fire('Perhatian', 'Pilih Pegawai dan Tipe Transaksi di form utama dulu!', 'warning');

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
      title: 'Multi Nominal',
      html: htmlTable,
      width: 700,
      showCancelButton: true,
      confirmButtonText: 'POST DATA',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#ffcc00',
      didOpen: () => {
        document.querySelectorAll('.swal-nom').forEach(input => {
          input.addEventListener('keyup', (e) => {
            let target = e.target as HTMLInputElement;
            let val = target.value.replace(/[^0-9]/g, '');
            target.value = val ? parseInt(val).toLocaleString('id-ID') : '';
            
            let total = 0;
            document.querySelectorAll('.swal-nom').forEach(inp => {
              total += Number((inp as HTMLInputElement).value.replace(/[^0-9]/g, ''));
            });
            document.getElementById('mn_total')!.innerText = total.toLocaleString('id-ID');
          });
        });
      },
      preConfirm: () => {
        if (!sumberDana) {
          Swal.showValidationMessage('Sumber Dana di form utama belum dipilih!');
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
            tanggal, nama: pegawaiTerpilih[i], tipe, nominal: Number(nom.replace(/[^0-9]/g, "")),
            sumber_dana: sumberDana, keterangan: ket, input_by: userAktif
          });
        }
        return payloads;
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        Swal.fire({ title: "Menyimpan Multi Data...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await supabase.from("transaksi").insert(result.value);
        if (error) Swal.fire("Gagal", error.message, "error");
        else {
          Swal.fire("Berhasil", "Semua data multi-nominal berhasil di-post!", "success");
          resetForm();
        }
      }
    });
  };

  // ================= FUNGSI REPORT =================
  const bukaFilterTanggal = (jenis: string) => {
    Swal.fire({
      title: `Filter ${jenis === 'REKAP' ? 'Rekap' : 'Detail'} Transaksi`,
      html: `
        <div style="text-align: left; margin: 10px 0;">
            <label style="font-weight:600; display:block; margin-bottom:5px;">Dari Tanggal:</label>
            <input type="date" id="swal_tgl_dari" class="swal2-input" style="width:90%; margin:0 0 15px 0;">
            <label style="font-weight:600; display:block; margin-bottom:5px;">Ke Tanggal:</label>
            <input type="date" id="swal_tgl_ke" class="swal2-input" style="width:90%; margin:0;">
        </div>
      `,
      showCancelButton: true, confirmButtonText: 'OK', confirmButtonColor: '#ffcc00',
      didOpen: () => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        (document.getElementById('swal_tgl_dari') as HTMLInputElement).value = firstDay;
        (document.getElementById('swal_tgl_ke') as HTMLInputElement).value = lastDay;
      },
      preConfirm: () => {
        const dari = (document.getElementById('swal_tgl_dari') as HTMLInputElement).value;
        const ke = (document.getElementById('swal_tgl_ke') as HTMLInputElement).value;
        if (!dari || !ke) { Swal.showValidationMessage('Isi tanggal Dari dan Ke!'); return false; }
        return { dari, ke };
      }
    }).then((res) => {
      if (res.isConfirmed) tarikDataReport(jenis, res.value.dari, res.value.ke);
    });
  };

  const tarikDataReport = async (jenis: string, dari: string, ke: string) => {
    Swal.fire({ title: 'Memuat Laporan...', didOpen: () => Swal.showLoading() });
    const { data, error } = await supabase
      .from('transaksi')
      .select('*')
      .gte('tanggal', dari)
      .lte('tanggal', ke)
      .order('tanggal', { ascending: true });

    if (error) {
      Swal.fire('Error', error.message, 'error');
    } else {
      Swal.close();
      setReportType(jenis);
      setReportPeriod(`${dari} s/d ${ke}`);
      setReportData(data || []);
      setActiveView("reportResult");
    }
  };

  // ================= KOMPONEN RENDER REPORT =================
  const renderTabelRekap = () => {
    if (reportData.length === 0) return <p style={{ textAlign: "center", padding: "30px", color: "#777" }}>Tidak ada transaksi pada periode ini.</p>;

    const listPegawai = Array.from(new Set(reportData.map((d) => d.nama))).sort() as string[];
    const rekap: any = { 'Uang Makan': {}, 'Kasbon': {}, 'Upah': {} };
    
    listPegawai.forEach(peg => { rekap['Uang Makan'][peg] = 0; rekap['Kasbon'][peg] = 0; rekap['Upah'][peg] = 0; });
    reportData.forEach(item => { if (rekap[item.tipe] !== undefined) rekap[item.tipe][item.nama] += Number(item.nominal); });

    const komponenList = [
      { key: 'Uang Makan', label: 'Total Uang makan' },
      { key: 'Kasbon', label: 'Total Kasbon' },
      { key: 'Upah', label: 'Total Pengambilan gaji' }
    ];

    let grandTotalKolom: any = {};
    listPegawai.forEach(peg => grandTotalKolom[peg] = 0);
    let absoluteTotal = 0;

    return (
      <div className="report-table-wrapper">
        <table className="table-report">
          <thead>
            <tr><th>Komponen</th>{listPegawai.map(peg => <th key={peg}>{peg}</th>)}<th>Total</th></tr>
          </thead>
          <tbody>
            {komponenList.map(comp => {
              let totalBaris = 0;
              return (
                <tr key={comp.key}>
                  <td style={{ fontWeight: 600 }}>{comp.label}</td>
                  {listPegawai.map(peg => {
                    let val = rekap[comp.key][peg] || 0;
                    totalBaris += val;
                    grandTotalKolom[peg] += val;
                    return <td key={peg}>{val > 0 ? val.toLocaleString('id-ID') : '-'}</td>;
                  })}
                  <td style={{ fontWeight: "bold" }}>{totalBaris > 0 ? totalBaris.toLocaleString('id-ID') : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: "bold" }}>TOTAL KESELURUHAN</td>
              {listPegawai.map(peg => {
                absoluteTotal += grandTotalKolom[peg];
                return <td key={peg}>{grandTotalKolom[peg] > 0 ? grandTotalKolom[peg].toLocaleString('id-ID') : '-'}</td>;
              })}
              <td style={{ color: "#b38600" }}>{absoluteTotal > 0 ? absoluteTotal.toLocaleString('id-ID') : '-'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const renderTabelDetail = () => {
    if (reportData.length === 0) return <p style={{ textAlign: "center", padding: "30px", color: "#777" }}>Tidak ada transaksi pada periode ini.</p>;

    const listPegawai = Array.from(new Set(reportData.map((d) => d.nama))).sort() as string[];
    const kategoriMap = [
      { key: 'Uang Makan', label: 'Uang Makan' },
      { key: 'Kasbon', label: 'Kasbon' },
      { key: 'Upah', label: 'Pengambilan Gaji' }
    ];

    return (
      <>
        {kategoriMap.map((kat) => {
          let filteredData = reportData.filter(item => item.tipe === kat.key);
          if (filteredData.length === 0) return null;

          let groupedByDate: any = {};
          filteredData.forEach(item => {
            if (!groupedByDate[item.tanggal]) groupedByDate[item.tanggal] = {};
            if (!groupedByDate[item.tanggal][item.nama]) groupedByDate[item.tanggal][item.nama] = 0;
            groupedByDate[item.tanggal][item.nama] += Number(item.nominal);
          });

          let tanggalList = Object.keys(groupedByDate).sort();
          let subTotalKolom: any = {};
          listPegawai.forEach(peg => subTotalKolom[peg] = 0);
          let grandTotalKategori = 0;

          return (
            <div key={kat.key}>
              <div className="report-section-title">{kat.label}</div>
              <div className="report-table-wrapper">
                <table className="table-report">
                  <thead>
                    <tr><th style={{ width: "120px" }}>Tanggal</th>{listPegawai.map(peg => <th key={peg}>{peg}</th>)}<th>Total</th></tr>
                  </thead>
                  <tbody>
                    {tanggalList.map(tgl => {
                      let totalBarisHarian = 0;
                      return (
                        <tr key={tgl}>
                          <td style={{ textAlign: "center", fontWeight: 500 }}>{tgl}</td>
                          {listPegawai.map(peg => {
                            let val = groupedByDate[tgl][peg] || 0;
                            totalBarisHarian += val;
                            subTotalKolom[peg] += val;
                            return <td key={peg}>{val > 0 ? val.toLocaleString('id-ID') : '-'}</td>;
                          })}
                          <td style={{ fontWeight: "bold" }}>{totalBarisHarian > 0 ? totalBarisHarian.toLocaleString('id-ID') : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: "bold", textAlign: "center" }}>SUBTOTAL</td>
                      {listPegawai.map(peg => {
                        grandTotalKategori += subTotalKolom[peg];
                        return <td key={peg}>{subTotalKolom[peg] > 0 ? subTotalKolom[peg].toLocaleString('id-ID') : '-'}</td>;
                      })}
                      <td style={{ color: "#b38600" }}>{grandTotalKategori > 0 ? grandTotalKategori.toLocaleString('id-ID') : '-'}</td>
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
        <div className="logo-area"><img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3FzdCmS3-ml79odLqkbtykQ5WGIpIg3ftxfb7TD1Z1Q&s=10" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
        <h1 className="cover-title">Sistem Integrasi Jurnal Kasbon & Gaji</h1>
        <p className="cover-subtitle">Ekstensi Auto-Jurnal via API Accurate untuk Transaksi Kasbon, Uang Makan, dan Gaji Karyawan</p>
        <div className="login-box">
          <h3>Login Akses</h3>
          <div className="login-field"><label>Nama User</label><input type="text" placeholder="Masukkan Nama User" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="login-field"><label>Password</label><input type="password" placeholder="Masukkan Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loginAplikasi()} /></div>
          <button className="btn btn-kuning" style={{ marginTop: "5px", width: "100%" }} onClick={loginAplikasi} disabled={isLoading}>{isLoading ? "Memeriksa..." : "Login & Mulai Input"}</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ---------------- VIEW: FORM UTAMA ---------------- */}
      {activeView === "form" && (
        <div id="form-page" style={{ display: "block", position: "relative" }}>
          {showDropdown && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} onClick={() => setShowDropdown(false)} />}
          <div className="top-bar"><span>User Aktif: <strong>{userAktif}</strong></span><button type="button" className="btn-logout" onClick={() => setIsLoggedIn(false)}>Logout</button></div>
          <div className="form-header"><h2>Form Inputan Transaksi</h2></div>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-row date-container">
              <div className="form-group"><label>Tanggal</label><input type="date" className="form-control" value={tanggal} onChange={(e) => setTanggal(e.target.value)} required /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ fontWeight: 600, width: "140px", flex: "0 0 140px", color: "#333" }}>Nama Pegawai</label>
                <div className="multi-select-container" style={{ zIndex: 10 }}>
                  <div className="multi-select-header" onClick={() => setShowDropdown(!showDropdown)}>
                    {pegawaiTerpilih.length === 0 ? "-- Pilih Pegawai --" : pegawaiTerpilih.length === 1 ? pegawaiTerpilih[0] : `${pegawaiTerpilih.length} Pegawai Dipilih`}
                  </div>
                  {showDropdown && (
                    <div className="multi-select-options" style={{ display: "block" }}>
                      {daftarPegawai.map((nama) => (
                        <label key={nama}><input type="checkbox" checked={pegawaiTerpilih.includes(nama)} onChange={() => togglePegawai(nama)} /> {nama}</label>
                      ))}
                      <div className="opsi-tambah-btn" onClick={tambahPegawaiBaru}>+ Tambah Pegawai Baru</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="form-row" style={{ alignItems: "flex-start", marginBottom: "28px" }}>
              <div className="form-group" style={{ alignItems: "center", marginRight: "25px" }}>
                <label style={{ width: "140px", flex: "0 0 140px" }}>Tipe Transaksi</label>
                <select className="form-control" style={{ height: "42px" }} value={tipe} onChange={(e) => setTipe(e.target.value)} required>
                  <option value="" disabled>-- Pilih Transaksi --</option><option value="Kasbon">Kasbon</option><option value="Uang Makan">Uang Makan</option><option value="Upah">Pengambilan Gaji / Upah</option>
                </select>
              </div>
              <div className="form-group" style={{ alignItems: "flex-start", marginRight: "0" }}>
                <label style={{ width: "80px", flex: "0 0 80px", height: "42px", display: "flex", alignItems: "center" }}>Nominal</label>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <input type="text" className="form-control" placeholder="0" style={{ height: "42px", width: "100%" }} value={nominal} onChange={(e) => handleFormatRupiah(e.target.value)} required />
                  <button type="button" className="btn-multi" style={{ marginTop: "8px", height: "34px" }} onClick={bukaMultiNominal}>+ Multi Nominal</button>
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ width: "140px", flex: "0 0 140px" }}>Sumber Dana</label>
                <select className="form-control" style={{ height: "42px" }} value={sumberDana} onChange={(e) => setSumberDana(e.target.value)} required>
                  <option value="" disabled>-- Pilih Sumber Dana --</option><option value="Kas Kasir 1">Kas Kasir 1</option><option value="Kas Kasir 2">Kas Kasir 2</option><option value="Kas Besar">Kas Besar</option><option value="BCA 8688">BCA 8688</option>
                </select>
              </div>
            </div>
            <div className="form-row" style={{ alignItems: "flex-start", marginTop: "10px" }}>
              <label style={{ width: "140px", flex: "0 0 140px", fontWeight: 600, color: "#333", marginTop: "10px" }}>Keterangan</label>
              <div className="keterangan-wrapper">
                <textarea className="form-control" placeholder="Isi keterangan atau klik tombol Generate..." value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
                <button type="button" className="btn-generate" style={{ height: "42px" }} onClick={() => setKeterangan(`Pengambilan ${tipe.toLowerCase()} a.n ${pegawaiTerpilih.join(", ")}`)}>Generate</button>
              </div>
            </div>
            <div className="action-buttons">
              <button type="button" className="btn btn-kuning" style={{ width: "140px" }} onClick={postData}>Post</button>
              <button type="button" className="btn btn-outline" style={{ width: "140px" }} onClick={resetForm}>Hapus</button>
              <button type="button" className="btn" style={{ width: "140px", backgroundColor: "#1a1a1a", color: "#fff", border: "2px solid #ffcc00" }} onClick={() => setActiveView("reportMenu")}>Report</button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- VIEW: MENU REPORT ---------------- */}
      {activeView === "reportMenu" && (
        <div id="report-menu-page" style={{ display: "block", backgroundColor: "#ffffff", width: "100%", maxWidth: "800px", borderRadius: "10px", borderTop: "6px solid #ffcc00", padding: "35px 40px" }}>
          <div className="form-header"><h2>Menu Laporan Transaksi</h2></div>
          <div className="report-menu-container">
            <button className="btn-report-menu" onClick={() => bukaFilterTanggal('REKAP')}>Rekap Transaksi</button>
            <button className="btn-report-menu" onClick={() => bukaFilterTanggal('DETAIL')}>Detail Transaksi</button>
            <button className="btn btn-outline" onClick={() => setActiveView("form")} style={{ marginTop: "10px" }}>Kembali ke Form Input</button>
          </div>
        </div>
      )}

      {/* ---------------- VIEW: HASIL REPORT ---------------- */}
      {activeView === "reportResult" && (
        <div id="report-result-page" style={{ display: "block", backgroundColor: "#ffffff", width: "95%", maxWidth: "1450px", borderRadius: "10px", borderTop: "6px solid #ffcc00", padding: "35px 40px" }}>
          <div className="top-bar">
            <span>Periode: <strong>{reportPeriod}</strong></span>
            <button type="button" className="btn-logout" onClick={() => setActiveView("reportMenu")}>Kembali ke Menu Report</button>
          </div>
          <div className="form-header"><h2>{reportType === "REKAP" ? "Rekap Transaksi" : "Rekap Detail Transaksi"}</h2></div>
          
          {/* Konten Tabel Otomatis Berdasarkan Tipe Report */}
          {reportType === "REKAP" ? renderTabelRekap() : renderTabelDetail()}
          
        </div>
      )}
    </>
  );
}