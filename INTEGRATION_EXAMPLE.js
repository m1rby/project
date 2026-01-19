/**
 * ПРИМЕР: Как интегрировать логирование в user-service
 * 
 * Скопируйте этот пример и адаптируйте для вашего сервиса
 */

const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Logger = require('../monitoring/logger');

const app = express();
app.use(express.json());

// ✅ Инициализируем логгер для этого сервиса
const logger = new Logger('user-service');

// Конфигурация БД
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/pharmacy'
});

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';

// ✅ Middleware для логирования всех HTTP запросов
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - start;
    // Логируем каждый HTTP запрос
    logger.httpRequest(req.method, req.path, res.statusCode, responseTime);
  });

  next();
});

// ============================================
// РЕГИСТРАЦИЯ
// ============================================
app.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // Валидация
    if (!email || !password) {
      logger.warn('Registration: Missing fields', { email });
      return res.status(400).send('Missing email or password');
    }

    if (password.length < 6) {
      logger.warn('Registration: Password too short', { email });
      return res.status(400).send('Password too short');
    }

    // Хешируем пароль
    const hashed = await bcrypt.hash(password, 8);
    const id = Math.random().toString();

    // Логируем попытку вставки в БД
    const dbStart = Date.now();
    
    try {
      const result = await pool.query(
        'INSERT INTO users (id, email, password_hash, name, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [id, email, hashed, name || 'User']
      );
      
      const dbTime = Date.now() - dbStart;
      logger.dbQuery('INSERT INTO users', dbTime);

      // ✅ Логируем успешную регистрацию
      logger.info('User registered successfully', {
        email,
        userId: id,
        name: name || 'User'
      });

      res.json({
        id,
        email,
        name: name || 'User',
        message: 'User registered successfully'
      });

    } catch (dbError) {
      // Проверяем если это уникальное ограничение (email уже существует)
      if (dbError.code === '23505') {
        logger.warn('Registration: Email already exists', { email });
        return res.status(409).send('Email already registered');
      }

      throw dbError;
    }

  } catch (error) {
    // ✅ Логируем ошибку регистрации
    logger.error('Registration failed', error, { email });
    logger.dbError('INSERT INTO users', error);

    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ВХОД
// ============================================
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Валидация
    if (!email || !password) {
      logger.warn('Login: Missing credentials', { email });
      return res.status(400).send('Missing email or password');
    }

    // Поиск пользователя в БД
    const dbStart = Date.now();
    
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const dbTime = Date.now() - dbStart;
    logger.dbQuery('SELECT FROM users WHERE email', dbTime);

    if (result.rows.length === 0) {
      // ✅ Логируем неудачную попытку входа (user not found)
      logger.authentication(false, email, 'User not found');
      return res.status(401).send('Invalid credentials');
    }

    const user = result.rows[0];

    // Проверяем пароль
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      // ✅ Логируем неудачную попытку входа (wrong password)
      logger.authentication(false, email, 'Wrong password');
      return res.status(401).send('Invalid credentials');
    }

    // Генерируем JWT токен
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ✅ Логируем успешный вход
    logger.authentication(true, email, null);
    logger.info('User logged in', {
      email,
      userId: user.id
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    // ✅ Логируем ошибку при входе
    logger.error('Login error', error, { email });
    logger.dbError('SELECT FROM users', error);

    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ПОЛУЧЕНИЕ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
// ============================================
app.get('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const dbStart = Date.now();
    
    const result = await pool.query(
      'SELECT id, email, name, phone, address, created_at FROM users WHERE id = $1',
      [userId]
    );

    const dbTime = Date.now() - dbStart;
    logger.dbQuery('SELECT FROM users WHERE id', dbTime);

    if (result.rows.length === 0) {
      logger.warn('User not found', { userId });
      return res.status(404).send('User not found');
    }

    const user = result.rows[0];

    // ✅ Логируем успешное получение данных пользователя
    logger.debug('User profile accessed', {
      userId,
      email: user.email
    });

    res.json(user);

  } catch (error) {
    logger.error('Failed to fetch user', error, { userId: req.user?.sub });
    logger.dbError('SELECT FROM users WHERE id', error);

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

    // Валидация
    if (!name || !phone || !address) {
      logger.warn('Profile update: Missing fields', {
        userId,
        providedFields: { name, phone, address }
      });
      return res.status(400).send('Missing required fields');
    }

    const dbStart = Date.now();
    
    const result = await pool.query(
      'UPDATE users SET name = $1, phone = $2, address = $3 WHERE id = $4 RETURNING *',
      [name, phone, address, userId]
    );

    const dbTime = Date.now() - dbStart;
    logger.dbQuery('UPDATE users SET', dbTime);

    if (result.rows.length === 0) {
      logger.warn('User not found for update', { userId });
      return res.status(404).send('User not found');
    }

    const user = result.rows[0];

    // ✅ Логируем успешное обновление профиля
    logger.info('User profile updated', {
      userId,
      email: user.email,
      updatedFields: ['name', 'phone', 'address']
    });

    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    logger.error('Failed to update profile', error, { userId: req.user?.sub });
    logger.dbError('UPDATE users SET', error);

    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// MIDDLEWARE: Верификация JWT токена
// ============================================
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    logger.warn('Missing authorization header', {
      path: req.path,
      method: req.method
    });
    return res.status(401).send('No authorization header');
  }

  const token = auth.replace(/^Bearer /, '');

  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (error) {
    logger.warn('Invalid token', { error: error.message });
    res.status(401).send('Invalid token');
  }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ============================================
async function ensureTables() {
  try {
    logger.info('Initializing database tables');

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

    // Миграция: добавляем колонки если их нет
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN phone TEXT`);
    } catch (e) {
      // Колонка уже существует
    }

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN address TEXT`);
    } catch (e) {
      // Колонка уже существует
    }

    logger.info('Database tables initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
const PORT = process.env.PORT || 3002;

ensureTables().then(() => {
  app.listen(PORT, () => {
    // ✅ Логируем запуск сервиса
    logger.info(`user-service started`, {
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    });
  });
}).catch(err => {
  logger.error('Failed to start user-service', err);
  process.exit(1);
});

module.exports = app;
