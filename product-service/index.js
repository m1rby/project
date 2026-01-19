const express = require('express')
const { Pool } = require('pg')
const bodyParser = require('body-parser')
const cors = require('cors')
const { randomUUID } = require('crypto')
const fs = require('fs')

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'adminsecret'

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
    service: 'PRODUCT-SERVICE',
    message,
    ...details
  }
  const logLine = JSON.stringify(logEntry) + '\n'
  
  // Вывод в консоль
  console.log(`[${timestamp}] [${level}] ${message}`, details)
  
  // Попытка записи в файл
  try {
    fs.appendFileSync('/var/log/product-service.log', logLine)
  } catch(e) {
    try {
      fs.appendFileSync('product-service.log', logLine)
    } catch(err) {}
  }
}

// Счетчики метрик
let httpRequestCount = 0
let httpErrorCount = 0
let searchCount = 0
let dbErrorCount = 0

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/pharmacy'
})

async function ensure(){
  await pool.query(`CREATE TABLE IF NOT EXISTS products(id text PRIMARY KEY, name text, description text, price numeric)`)
  await pool.query(`CREATE TABLE IF NOT EXISTS pharmacies(id text PRIMARY KEY, name text, address text)`)
  const r = await pool.query('SELECT count(*) FROM products')
  if(+r.rows[0].count===0){
    await pool.query(`INSERT INTO products(id,name,description,price) VALUES
      ('p1','Аспирин 500мг','Обезболивающее и жаропонижающее средство',89.99),
      ('p2','Парацетамол 250мг','Лечение простуды и гриппа',45.00),
      ('p3','Ибупрофен 200мг','Противовоспалительное средство',125.50),
      ('p4','Амоксициллин 500мг','Антибиотик широкого спектра',380.00),
      ('p5','Витамин C 500мг','Укрепление иммунитета',199.99),
      ('p6','Витамин D3 1000IU','Здоровье костей и зубов',250.00),
      ('p7','Мультивитамины','Комплекс витаминов и минералов',450.00),
      ('p8','Тиенам','Противомикробное средство',560.00),
      ('p9','Ранитидин 150мг','Снижение кислотности желудка',320.00),
      ('p10','Омепразол 20мг','Лечение кислотного рефлюкса',280.00),
      ('p11','Эспумизан','Ветрогонное средство',340.00),
      ('p12','Бисакодил 5мг','Слабительное средство',120.00),
      ('p13','Активированный уголь','Адсорбент токсинов',65.00),
      ('p14','Лоперамид 2мг','Средство от диареи',150.00),
      ('p15','Супрастин 25мг','Антигистаминное средство',95.00),
      ('p16','Тавегил 1мг','Противоаллергическое средство',140.00),
      ('p17','Промотор','Улучшение пищеварения',210.00),
      ('p18','Фестал','Ферментный препарат',380.00),
      ('p19','Метформин 500мг','Лечение диабета',280.00),
      ('p20','Глюкоза таблетки','Источник энергии',50.00)
    `)
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

app.get('/products', async (req,res)=>{
  try {
    searchCount++
    const r = await pool.query('SELECT id,name,description,price FROM products')
    formatLog('PRODUCT_SEARCH', 'Product catalog search performed', {
      productsFound: r.rows.length,
      timestamp: new Date().toISOString()
    })
    res.json(r.rows)
  } catch (e) {
    dbErrorCount++
    formatLog('PRODUCT_ERROR', 'Error during product search', {
      errorType: 'DATABASE_ERROR',
      errorMessage: e.message
    })
    res.status(500).json({error: e.message})
  }
})

app.delete('/products/:id', async (req,res)=>{
  const token = req.headers['admin_token'] || req.headers['x-admin-token']
  if(token!==ADMIN_TOKEN) return res.status(403).send('forbidden')
  const id = req.params.id
  await pool.query('DELETE FROM products WHERE id=$1',[id])
  res.send('ok')
})

app.put('/products/:id', async (req,res)=>{
  const token = req.headers['admin_token'] || req.headers['x-admin-token']
  if(token!==ADMIN_TOKEN) return res.status(403).send('forbidden')
  const id = req.params.id
  const {name,price,description} = req.body
  await pool.query('UPDATE products SET name=$1,price=$2,description=$3 WHERE id=$4',[name,price,description,id])
  res.json({id,name,price,description})
})

// Pharmacies
app.get('/pharmacies', async (req,res)=>{
  const r = await pool.query('SELECT id,name,address FROM pharmacies')
  res.json(r.rows)
})

app.post('/pharmacies', async (req,res)=>{
  const token = req.headers['admin_token'] || req.headers['x-admin-token']
  if(token!==ADMIN_TOKEN) return res.status(403).send('forbidden')
  const id = randomUUID().replace(/-/g,'').slice(0,8)
  const {name,address} = req.body
  await pool.query('INSERT INTO pharmacies(id,name,address) VALUES($1,$2,$3)',[id,name,address])
  res.json({id,name,address})
})

app.post('/products', async (req,res)=>{
  const token = req.headers['admin_token'] || req.headers['x-admin-token']
  if(token!==ADMIN_TOKEN) return res.status(403).send('forbidden')
  const id = randomUUID().replace(/-/g,'').slice(0,8)
  const {name,price,description} = req.body
  await pool.query('INSERT INTO products(id,name,description,price) VALUES($1,$2,$3,$4)',[id,name,description,price])
  res.json({id,name,price,description})
})

// Prometheus metrics endpoint
app.get('/metrics', (req,res)=>{
  res.set('Content-Type', 'text/plain')
  res.send(`# HELP product_service_http_requests_total Total HTTP requests
# TYPE product_service_http_requests_total counter
product_service_http_requests_total ${httpRequestCount}

# HELP product_service_http_errors_total Total HTTP errors
# TYPE product_service_http_errors_total counter
product_service_http_errors_total ${httpErrorCount}

# HELP product_service_search_total Product search requests
# TYPE product_service_search_total counter
product_service_search_total ${searchCount}

# HELP product_service_db_errors_total Database errors
# TYPE product_service_db_errors_total counter
product_service_db_errors_total ${dbErrorCount}
`)
})

const port = process.env.PORT || 3001
ensure().then(()=>{
  app.listen(port,()=>console.log('product-service on',port))
}).catch(err=>{console.error(err);process.exit(1)})
