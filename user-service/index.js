const express = require('express')
const { Pool } = require('pg')
const bodyParser = require('body-parser')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'adminsecret'

// Логирование
const LOG_FILE = '/var/log/user-service.log'
function getTimestamp() {
  const now = new Date()
  return now.toISOString()
}

function formatLog(level, message, details = {}) {
  const timestamp = getTimestamp()
  const logEntry = {
    timestamp,
    level,
    service: 'USER-SERVICE',
    message,
    ...details
  }
  const logLine = JSON.stringify(logEntry) + '\n'
  
  // Вывод в консоль
  console.log(`[${timestamp}] [${level}] ${message}`, details)
  
  // Попытка записи в файл
  try {
    fs.appendFileSync(LOG_FILE, logLine)
  } catch(e) {
    // Если не удалось записать в /var/log, пишем в текущую папку
    try {
      fs.appendFileSync('user-service.log', logLine)
    } catch(err) {}
  }
}

// Счетчики метрик
let httpRequestCount = 0
let httpErrorCount = 0
let authSuccessCount = 0
let authFailCount = 0
let userRegistrationCount = 0
let dbErrorCount = 0

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/pharmacy'
})

async function ensure(){
  // Create table if not exists
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY, email text UNIQUE, name text, password_hash text)`)
  
  // Add new columns if they don't exist
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN phone text`)
  } catch(e) {
    // Column already exists, ignore
  }
  
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN address text`)
  } catch(e) {
    // Column already exists, ignore
  }
}

const app = express()
app.use(cors())
app.use(bodyParser.json())

// Middleware для подробного логирования всех запросов
app.use((req, res, next) => {
  const requestId = randomUUID().substring(0, 8)
  const startTime = Date.now()
  httpRequestCount++
  
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
  
  formatLog('REQUEST_START', `Incoming HTTP request`, {
    requestId,
    method: req.method,
    path: req.path,
    clientIp,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type']
  })
  
  // Перехватываем окончание ответа
  const originalSend = res.send
  res.send = function(data) {
    const duration = Date.now() - startTime
    const statusCode = res.statusCode
    
    if (statusCode >= 400) {
      httpErrorCount++
      formatLog('REQUEST_ERROR', `HTTP error response`, {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
        clientIp
      })
    } else {
      formatLog('REQUEST_SUCCESS', `HTTP request completed`, {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
        clientIp
      })
    }
    
    return originalSend.call(this, data)
  }
  
  next()
})

app.get('/health',(req,res)=>res.send('ok'))

// Admin: list users (admin_token header required)
app.get('/users', async (req,res)=>{
  const token = req.headers['admin_token'] || req.headers['x-admin-token']
  if(token !== ADMIN_TOKEN) return res.status(403).send('forbidden')
  const r = await pool.query('SELECT id,email,name FROM users')
  res.json(r.rows)
})

app.post('/register', async (req,res)=>{
  const {email,password,name} = req.body
  if(!email||!password) {
    formatLog('VALIDATION_ERROR', 'Registration validation failed', {
      email: email || 'missing',
      providedName: name || 'missing'
    })
    return res.status(400).send('missing')
  }
  
  const hashed = await bcrypt.hash(password,8)
  const id = randomUUID().replace(/-/g,'').slice(0,8)
  try{
    await pool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[id,email,name,hashed])
    userRegistrationCount++
    formatLog('USER_REGISTERED', 'New user account created', {
      userId: id,
      email: email,
      name: name,
      timestamp: new Date().toISOString()
    })
    res.json({id,email,name})
  }catch(e){
    dbErrorCount++
    formatLog('REGISTRATION_ERROR', 'User registration failed', {
      email: email,
      errorType: e.code === '23505' ? 'DUPLICATE_EMAIL' : 'DATABASE_ERROR',
      errorMessage: e.message
    })
    res.status(400).send('exists')
  }
})

app.post('/login', async (req,res)=>{
  const {email,password} = req.body
  try {
    const r = await pool.query('SELECT id,email,password_hash FROM users WHERE email=$1',[email])
    if(r.rowCount===0) {
      authFailCount++
      formatLog('AUTH_FAILED', 'Login attempt with non-existent user', {
        email: email,
        reason: 'USER_NOT_FOUND',
        timestamp: new Date().toISOString()
      })
      return res.status(400).send('bad')
    }
    
    const u = r.rows[0]
    const ok = await bcrypt.compare(password, u.password_hash)
    if(!ok) {
      authFailCount++
      formatLog('AUTH_FAILED', 'Login attempt with incorrect password', {
        email: email,
        userId: u.id,
        reason: 'INVALID_PASSWORD',
        timestamp: new Date().toISOString()
      })
      return res.status(400).send('bad')
    }
    
    authSuccessCount++
    const token = jwt.sign({sub:u.id,email:u.email}, JWT_SECRET, {expiresIn:'8h'})
    formatLog('AUTH_SUCCESS', 'User successfully authenticated', {
      userId: u.id,
      email: email,
      tokenExpiry: '8h',
      timestamp: new Date().toISOString()
    })
    res.json({token})
  } catch(e) {
    dbErrorCount++
    formatLog('AUTH_ERROR', 'Login error occurred', {
      email: email,
      errorType: 'DATABASE_ERROR',
      errorMessage: e.message
    })
    res.status(500).send('error')
  }
})

app.get('/me', async (req,res)=>{
  const auth = req.headers.authorization
  if(!auth) return res.status(401).send('no')
  const token = auth.replace(/^Bearer /,'')
  try{ 
    const data = jwt.verify(token, JWT_SECRET)
    const r = await pool.query('SELECT id,email,name,phone,address FROM users WHERE id=$1',[data.sub])
    if(r.rowCount === 0) return res.status(404).send('not found')
    const user = r.rows[0]
    res.json({...data, name: user.name, phone: user.phone, address: user.address})
  }catch(e){res.status(401).send('bad')}
})

// Update profile (phone, address, name)
app.patch('/me', async (req,res)=>{
  const auth = req.headers.authorization
  if(!auth) return res.status(401).send('no')
  const token = auth.replace(/^Bearer /,'')
  try{
    const data = jwt.verify(token, JWT_SECRET)
    const {name, phone, address} = req.body
    await pool.query('UPDATE users SET name=$1, phone=$2, address=$3 WHERE id=$4',[name||'', phone||'', address||'', data.sub])
    res.json({success: true})
  }catch(e){
    console.error(e)
    res.status(401).send('bad')
  }
})

// Prometheus metrics endpoint
app.get('/metrics', (req,res)=>{
  res.set('Content-Type', 'text/plain')
  res.send(`# HELP user_service_http_requests_total Total HTTP requests
# TYPE user_service_http_requests_total counter
user_service_http_requests_total ${httpRequestCount}

# HELP user_service_http_errors_total Total HTTP errors
# TYPE user_service_http_errors_total counter
user_service_http_errors_total ${httpErrorCount}

# HELP user_service_auth_success_total Successful authentications
# TYPE user_service_auth_success_total counter
user_service_auth_success_total ${authSuccessCount}

# HELP user_service_auth_fail_total Failed authentications
# TYPE user_service_auth_fail_total counter
user_service_auth_fail_total ${authFailCount}

# HELP user_service_registrations_total User registrations
# TYPE user_service_registrations_total counter
user_service_registrations_total ${userRegistrationCount}

# HELP user_service_db_errors_total Database errors
# TYPE user_service_db_errors_total counter
user_service_db_errors_total ${dbErrorCount}
`)
})

const port = process.env.PORT || 3002
ensure().then(()=>{
  app.listen(port,()=>console.log('user-service on',port))
}).catch(err=>{console.error(err);process.exit(1)})
