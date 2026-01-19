const express = require('express')
const { Pool } = require('pg')
const bodyParser = require('body-parser')
const cors = require('cors')
const { randomUUID } = require('crypto')
const fs = require('fs')

// Логирование
function getTimestamp() {
  const now = new Date()
  return now.toISOString()
}

function formatLog(level, message, details = {}) {
  const timestamp = getTimestamp()
  const logEntry = {
    timestamp,
    level,
    service: 'ORDER-SERVICE',
    message,
    ...details
  }
  const logLine = JSON.stringify(logEntry) + '\n'
  
  // Вывод в консоль
  console.log(`[${timestamp}] [${level}] ${message}`, details)
  
  // Попытка записи в файл
  try {
    fs.appendFileSync('/var/log/order-service.log', logLine)
  } catch(e) {
    try {
      fs.appendFileSync('order-service.log', logLine)
    } catch(err) {}
  }
}

// Счетчики метрик
let httpRequestCount = 0
let httpErrorCount = 0
let ordersCreatedCount = 0
let dbErrorCount = 0

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/pharmacy'
})

async function ensure(){
  await pool.query(`CREATE TABLE IF NOT EXISTS orders(id text PRIMARY KEY, items jsonb, fulfillment text, status text, created_at timestamptz, user_id text, phone text, email text, address text)`)
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
    userAgent: req.headers['user-agent']
  })
  
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

app.get('/orders', async (req,res)=>{
  const r = await pool.query('SELECT id,items,fulfillment,status,created_at,user_id,phone,email,address FROM orders ORDER BY created_at DESC')
  res.json(r.rows)
})

app.post('/orders', async (req,res)=>{
  try {
    const body = req.body
    if(!body.items||!Array.isArray(body.items)) return res.status(400).json({error:'items required'})
    
    const id = randomUUID().replace(/-/g,'').slice(0,8)
    const createdAt = new Date().toISOString()

    // Try to resolve user from Authorization header by calling user-service
    let userId = null
    try{
      const auth = req.headers.authorization
      if(auth){
        const r = await fetch('http://user-service:3002/me',{headers:{authorization:auth}})
        if(r.ok){
          const data = await r.json()
          userId = data.sub || data.id || null
        }
      }
    }catch(e){
      console.warn('⚠️ User resolve failed:',e.message)
    }

    await pool.query(
      'INSERT INTO orders(id,items,fulfillment,status,created_at,user_id,phone,email,address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, JSON.stringify(body.items), body.fulfillment||'delivery', 'pending', createdAt, userId, body.phone||'', body.email||'', body.address||'']
    )
    
    ordersCreatedCount++
    const totalPrice = body.items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0)
    formatLog('ORDER_CREATED', 'New order successfully created', {
      orderId: id,
      userId: userId,
      itemCount: body.items.length,
      totalPrice: totalPrice,
      fulfillmentType: body.fulfillment || 'delivery',
      timestamp: createdAt
    })
    res.json({id, items:body.items, fulfillment:body.fulfillment||'delivery', status:'pending', created_at:createdAt, user_id:userId})
  } catch(e) {
    dbErrorCount++
    formatLog('ORDER_ERROR', 'Failed to create order', {
      errorType: e.code ? 'DATABASE_ERROR' : 'UNKNOWN_ERROR',
      errorMessage: e.message,
      errorCode: e.code || null
    })
    res.status(500).json({error: e.message})
  }
})

// Prometheus metrics endpoint
app.get('/metrics', (req,res)=>{
  res.set('Content-Type', 'text/plain')
  res.send(`# HELP order_service_http_requests_total Total HTTP requests
# TYPE order_service_http_requests_total counter
order_service_http_requests_total ${httpRequestCount}

# HELP order_service_http_errors_total Total HTTP errors
# TYPE order_service_http_errors_total counter
order_service_http_errors_total ${httpErrorCount}

# HELP order_service_orders_created_total Orders created
# TYPE order_service_orders_created_total counter
order_service_orders_created_total ${ordersCreatedCount}

# HELP order_service_db_errors_total Database errors
# TYPE order_service_db_errors_total counter
order_service_db_errors_total ${dbErrorCount}
`)
})

const port = process.env.PORT || 3003
ensure().then(()=>{
  app.listen(port,()=>console.log('order-service on',port))
}).catch(err=>{console.error(err);process.exit(1)})
