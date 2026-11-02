# Demo tugas akhir: pengaruh hari libur terhadap jadwal proyek

Proyek **ZR-006 — Demo TA Kalender Libur Mei 2026** adalah data simulasi untuk presentasi, bukan catatan proyek nyata. Pemilik proyek: Iman Kusuma. Buka **Projects → ZR-006 → Schedule**, lalu aktifkan **Include holidays**.

Lima task terhubung berurutan dengan hubungan finish-to-start. Skenario yang dibandingkan menggunakan rencana yang sama dan menganggap Sabtu serta Minggu sebagai hari nonkerja. Skenario kedua juga mengecualikan hari libur nasional dan cuti bersama dalam data kalender Indonesia.

| Skenario rencana | Tanggal selesai |
| --- | --- |
| Akhir pekan nonkerja | 26 Mei 2026 |
| Akhir pekan, libur nasional, dan cuti bersama nonkerja | 3 Juni 2026 |
| Selisih | 8 hari kalender |

Libur pada hari kerja yang relevan dalam rentang perbandingan adalah 1 Mei, 14–15 Mei, 27–28 Mei, dan 1 Juni. Libur 31 Mei bertepatan dengan Minggu yang sudah nonkerja, sehingga tidak dihitung sebagai hari libur tambahan. Daftar libur berasal dari Indonesian Holidays API; tautan sumber SKB tersedia pada panel perbandingan di aplikasi.

Gantt menampilkan batang jadwal skenario, tanggal rencana berupa garis putus-putus, tanggal aktual yang dicatat berwarna hijau, dan panah dependensi. Bagian kosong dalam batang jadwal menunjukkan hari nonkerja. Simulasi perbandingan tidak mengubah jadwal tersimpan.

Jadwal tersimpan dan hasil perbandingan bisa berbeda: jadwal tersimpan menggunakan forecast dan tanggal aktual simulasi, sedangkan perbandingan libur memakai basis rencana. Submission dan waktu review dibuat pada tanggal penggunaan aplikasi; tanggal historis proyek dan progresnya adalah data simulasi.

## Tangkapan layar

1. `01-proyek-dan-task.png` — proyek, task, status, assignee, dan tanggal.
2. `02-tim-proyek.png` — anggota dan peran proyek.
3. `03-submission-progres.png` — submission dan status review.
4. `04-perbandingan-dampak-libur.png` — tanggal selesai, selisih, dan daftar libur.
5. `05-gantt-dengan-libur.png` — Gantt saat libur nasional dan cuti bersama diaktifkan.
6. `06-detail-task-dependency.png` — rincian tanggal dan hubungan predecessor/successor.
7. `07-gantt-tanpa-libur.png` — Gantt pembanding tanpa libur nasional tambahan.
8. `08-antrian-review.png` — antrian keputusan reviewer.
9. `09-milestone.png` — milestone proyek.
10. `10-progres-proyek.png` — proyek pada daftar proyek.
11. `11-progres-berbobot.png` — progres proyek berbobot durasi.
