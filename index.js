const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-UMKM-API-Version', '2');
  next();
});

// Konfigurasi koneksi database
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'pojokngadiluwih1_db',
  password: 'root',
  port: 5432,
});

// ==========================================
// ENDPOINT TABEL UMKM
// ==========================================

app.get('/umkm/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ message: 'ID harus berupa angka valid.' });
    }

    const result = await pool.query('SELECT * FROM umkm WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `Data UMKM dengan ID ${id} tidak ditemukan.` });
    }

    return res.status(200).json(result.rows[0]);

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Terdapat kesalahan pada server.'
    });
  }
});

app.get('/umkm', async (req, res) => {
  try {
    const namaProduk = req.query.nama_produk;
    if (namaProduk !== undefined && typeof namaProduk !== 'string') {
      return res.status(400).json({
        message: 'Parameter nama_produk harus berupa teks.'
      });
    }

    const result = namaProduk?.trim()
      ? await pool.query(
        'SELECT * FROM umkm WHERE nama_produk ILIKE $1 ORDER BY id ASC',
        [`%${namaProduk.trim()}%`]
      )
      : await pool.query('SELECT * FROM umkm ORDER BY id ASC');

    return res.status(200).json(result.rows);

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Terdapat kesalahan pada server.'
    });
  }
});


app.post('/umkm', async (req, res) => {
  try {
    const { id, nama_produk, jumlah, harga } = req.body;
    const username = req.body.username ?? req.body.name ?? req.body.nama;
    if (!username || !nama_produk || jumlah == null || harga == null) {
      return res.status(400).json({
        message: 'username (atau name/nama), nama_produk, jumlah, dan harga wajib diisi.'
      });
    }

    let newUmkm;
    if (id !== undefined) {
      const requestedId = Number(id);
      if (!Number.isSafeInteger(requestedId) || requestedId < 1) {
        return res.status(400).json({ message: 'ID harus berupa bilangan bulat positif.' });
      }

      newUmkm = await pool.query(
        'INSERT INTO umkm (id, username, nama_produk, jumlah, harga) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [requestedId, username, nama_produk, jumlah, harga]
      );

      await pool.query(
        `SELECT setval(
          pg_get_serial_sequence('umkm', 'id'),
          (SELECT COALESCE(MAX(id), 1) FROM umkm),
          EXISTS (SELECT 1 FROM umkm)
        )`
      );
    } else {
      newUmkm = await pool.query(
        'INSERT INTO umkm (username, nama_produk, jumlah, harga) VALUES ($1, $2, $3, $4) RETURNING *',
        [username, nama_produk, jumlah, harga]
      );
    }

    res.status(201).json(newUmkm.rows[0]);
  } catch (err) {
    console.error(err.message);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'ID tersebut sudah digunakan.' });
    }
    res.status(500).send('Server Error');
  }
});

app.put('/umkm/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, nama_produk, jumlah, harga } = req.body; 
    
    const updateData = await pool.query(
      'UPDATE umkm SET username = $1, nama_produk = $2, jumlah = $3, harga = $4 WHERE id = $5 RETURNING *',
      [username, nama_produk, jumlah, harga, id]
    );
    
    if (updateData.rows.length === 0) {
      return res.status(404).json({ message: 'Data UMKM tidak ditemukan' });
    }
    res.json(updateData.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.delete('/umkm/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteData = await pool.query('DELETE FROM umkm WHERE id = $1 RETURNING *', [id]);
    if (deleteData.rows.length === 0) {
      return res.status(404).json({ message: 'Data UMKM tidak ditemukan' });
    }
    res.json({ message: 'Data UMKM berhasil dihapus' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

async function startServer() {
  try {
    await pool.query(
      `SELECT setval(
        pg_get_serial_sequence('umkm', 'id'),
        (SELECT COALESCE(MAX(id), 1) FROM umkm),
        EXISTS (SELECT 1 FROM umkm)
      )`
    );

    const server = app.listen(port, () => {
      console.log(`UMKM API v2 berjalan di http://localhost:${port} (PID ${process.pid})`);
    });
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} sedang dipakai proses lain. Hentikan server lama lalu jalankan ulang aplikasi ini.`);
      } else {
        console.error('Gagal menjalankan server:', error.message);
      }
      pool.end().finally(() => {
        process.exitCode = 1;
      });
    });
  } catch (error) {
    console.error('Gagal menyiapkan data UMKM atau menjalankan server:', error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

startServer();