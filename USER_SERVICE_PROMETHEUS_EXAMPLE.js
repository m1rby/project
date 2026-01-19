/**
 * ПРИМЕР: User Service с Prometheus метриками
 * 
 * Этот пример показывает как интегрировать Prometheus экспортер
 */

const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PrometheusMetrics = require('../monitoring/prometheus-exporter');

const app = express();
app.use(express.json());

// ✅ Инициализируем Prometheus метрики
const metrics = new PrometheusMetrics('user-service');

// ✅ Добавляем middleware для автоматического логирования HTTP запросов
app.use(metrics.middleware());

// Конфигурация БД
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/pharmacy'
});

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';

// ============================================
// РЕГИСТРАЦИЯ
// ============================================
app.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).send('Missing email or password');
    }

    if (password.length < 6) {
      return res.status(400).send('Password too short');
    }

    const hashed = await bcrypt.hash(password, 8);
    const id = Math.random().toString();

    const start = Date.now();
    
    try {
      const result = await pool.query(
        'INSERT INTO users (id, email, password_hash, name, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [id, email, hashed, name || 'User']
      );
      
      const queryTime = Date.now() - start;
      // ✅ Логируем время БД операции
      metrics.recordHistogram('dbQueryDuration', queryTime, {
        query_type: 'INSERT_users'
      });

      console.log('✅ User registered:', email);

      res.json({
        id,
        email,
        name: name || 'User',
        message: 'User registered successfully'
      });

    } catch (dbError) {
      // ✅ Логируем ошибку БД
      metrics.incrementCounter('dbErrorsTotal', {
        error_type: 'unique_violation'
      });

      if (dbError.code === '23505') {
        return res.status(409).send('Email already registered');
      }

      throw dbError;
    }

  } catch (error) {
    // ✅ Логируем ошибку БД
    metrics.incrementCounter('dbErrorsTotal', {
      error_type: 'unknown'
    });

    console.error('❌ Registration error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ВХОД
// ============================================
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).send('Missing email or password');
    }

    const start = Date.now();
    
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const queryTime = Date.now() - start;
    // ✅ Логируем время БД запроса
    metrics.recordHistogram('dbQueryDuration', queryTime, {
      query_type: 'SELECT_user_by_email'
    });

    if (result.rows.length === 0) {
      // ✅ Логируем неудачный вход
      metrics.incrementCounter('usersAuthenticated', {
        result: 'failure'
      });
      return res.status(401).send('Invalid credentials');
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      // ✅ Логируем неудачный вход
      metrics.incrementCounter('usersAuthenticated', {
        result: 'failure'
      });
      return res.status(401).send('Invalid credentials');
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ✅ Логируем успешный вход
    metrics.incrementCounter('usersAuthenticated', {
      result: 'success'
    });

    console.log('✅ User logged in:', email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    metrics.incrementCounter('dbErrorsTotal', {
      error_type: 'unknown'
    });

    console.error('❌ Login error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ПОЛУЧЕНИЕ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
// ============================================
app.get('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const start = Date.now();
    
    const result = await pool.query(
      'SELECT id, email, name, phone, address, created_at FROM users WHERE id = $1',
      [userId]
    );

    const queryTime = Date.now() - start;
    // ✅ Логируем время БД запроса
    metrics.recordHistogram('dbQueryDuration', queryTime, {
      query_type: 'SELECT_user_by_id'
    });

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = result.rows[0];
    res.json(user);

  } catch (error) {
    metrics.incrementCounter('dbErrorsTotal', {
      error_type: 'unknown'
    });

    console.error('❌ Error fetching user:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ОБНОВЛЕНИЕ ПРОФИЛЯ
// ============================================
app.patch('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { name, phone, address } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).send('Missing required fields');
    }

    const start = Date.now();
    
    const result = await pool.query(
      'UPDATE users SET name = $1, phone = $2, address = $3 WHERE id = $4 RETURNING *',
      [name, phone, address, userId]
    );

    const queryTime = Date.now() - start;
    // ✅ Логируем время БД запроса
    metrics.recordHistogram('dbQueryDuration', queryTime, {
      query_type: 'UPDATE_user'
    });

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    metrics.incrementCounter('dbErrorsTotal', {
      error_type: 'unknown'
    });

    console.error('❌ Error updating profile:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ✅ PROMETHEUS METRICS ENDPOINT
// ============================================
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.export());
});

// ============================================
// MIDDLEWARE: Верификация JWT
// ============================================
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).send('No authorization header');
  }

  const token = auth.replace(/^Bearer /, '');

  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (error) {
    res.status(401).send('Invalid token');
  }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ============================================
async function ensureTables() {
  try {
    console.log('📦 Initializing database tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        phone TEXT,
        address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN phone TEXT`);
    } catch (e) {}

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN address TEXT`);
    } catch (e) {}

    console.log('✅ Database tables initialized');

  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
const PORT = process.env.PORT || 3002;

ensureTables().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 user-service started on port ${PORT}`);
    console.log(`📊 Prometheus metrics available at: http://localhost:${PORT}/metrics\n`);
  });
}).catch(err => {
  console.error('❌ Failed to start user-service:', err);
  process.exit(1);
});

module.exports = app;
