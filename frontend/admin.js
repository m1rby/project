const API_P = 'http://localhost:3001'
const API_U = 'http://localhost:3002'
const API_O = 'http://localhost:3003'

let currentEditProduct = null

function el(id) { return document.getElementById(id) }

// ===== TAB SWITCHING =====
document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab')
    
    // Remove active from all tabs and contents
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    
    // Add active to clicked tab and its content
    btn.classList.add('active')
    el(tabName).classList.add('active')
    
    // Load content if needed
    loadTabContent(tabName)
  })
})

async function loadTabContent(tabName) {
  try {
    if (tabName === 'products') {
      const products = await fetch(API_P + '/products').then(r => r.json())
      renderProductsList(products)
    } else if (tabName === 'orders') {
      const orders = await fetch(API_O + '/orders').then(r => r.json())
      renderOrdersList(orders)
    } else if (tabName === 'users') {
      const users = await fetch(API_U + '/users', { headers: { 'admin_token': el('admintoken').value } }).then(r => r.ok ? r.json() : [])
      renderUsersList(users)
    } else if (tabName === 'pharmacies') {
      const pharmacies = await fetch(API_P + '/pharmacies').then(r => r.json())
      renderPharmaciesList(pharmacies)
    } else if (tabName === 'health') {
      loadHealthStatus()
    }
  } catch (e) {
    console.error(e)
  }
}

// ===== HEALTH STATUS =====
async function loadHealthStatus() {
  try {
    const [h1, h2, h3] = await Promise.all([
      fetch(API_P + '/health').then(r => r.text()),
      fetch(API_U + '/health').then(r => r.text()),
      fetch(API_O + '/health').then(r => r.text())
    ])
    
    const healthList = el('health-list')
    healthList.innerHTML = `
      <div class="health-item">
        <span>🩺 Сервис Лекарств (Product Service)</span>
        <span class="health-status ${h1 === 'ok' ? 'ok' : 'error'}">${h1}</span>
      </div>
      <div class="health-item">
        <span>👤 Сервис Пользователей (User Service)</span>
        <span class="health-status ${h2 === 'ok' ? 'ok' : 'error'}">${h2}</span>
      </div>
      <div class="health-item">
        <span>📦 Сервис Заказов (Order Service)</span>
        <span class="health-status ${h3 === 'ok' ? 'ok' : 'error'}">${h3}</span>
      </div>
    `
  } catch (e) {
    el('health-list').innerHTML = `<div class="health-item"><span>❌ Ошибка</span><span class="health-status error">${e.message}</span></div>`
  }
}

// ===== PRODUCTS =====
async function renderProductsList(products) {
  const container = el('products-list')
  
  if (!products || products.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📭 Нет лекарств. Добавьте первое лекарство!</p></div>'
    return
  }
  
  container.innerHTML = products.map(p => `
    <div class="product-item">
      <div class="product-item-header">
        <h3 class="product-item-title">💊 ${p.name}</h3>
        <div class="product-item-price">${p.price} ₽</div>
      </div>
      <p class="product-item-desc">${p.description || 'Нет описания'}</p>
      <div class="product-item-actions">
        <button class="btn-edit" onclick="openEditModal('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${p.price}, '${(p.description || '').replace(/'/g, "\\'")}')" title="Редактировать">✏️ Редактировать</button>
        <button class="btn-delete" onclick="deleteProduct('${p.id}')" title="Удалить">🗑️ Удалить</button>
      </div>
    </div>
  `).join('')
}

function openEditModal(id, name, price, desc) {
  currentEditProduct = id
  el('edit-prod-name').value = name
  el('edit-prod-price').value = price
  el('edit-prod-desc').value = desc
  el('editModal').classList.add('active')
}

function closeEditModal() {
  el('editModal').classList.remove('active')
  currentEditProduct = null
}

async function deleteProduct(id) {
  if (!confirm('⚠️ Вы уверены? Лекарство будет удалено безвозвратно.')) return
  
  try {
    const res = await fetch(API_P + `/products/${id}`, {
      method: 'DELETE',
      headers: { 'admin_token': el('admintoken').value }
    })
    
    if (res.ok) {
      alert('✅ Лекарство удалено успешно!')
      loadAll()
    } else {
      alert('❌ Ошибка при удалении: ' + res.status)
    }
  } catch (e) {
    alert('❌ Ошибка: ' + e.message)
  }
}

el('add-product').addEventListener('click', async () => {
  const name = el('prod-name').value.trim()
  const price = parseFloat(el('prod-price').value)
  const desc = el('prod-desc').value.trim()
  
  if (!name) { alert('⚠️ Введите название'); return }
  if (!price || price <= 0) { alert('⚠️ Введите корректную цену'); return }
  if (!desc) { alert('⚠️ Введите описание'); return }
  
  try {
    const res = await fetch(API_P + '/products', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'admin_token': el('admintoken').value
      },
      body: JSON.stringify({ name, price, description: desc })
    })
    
    if (res.ok) {
      alert('✅ Лекарство добавлено успешно!')
      el('prod-name').value = ''
      el('prod-price').value = ''
      el('prod-desc').value = ''
      loadAll()
    } else {
      alert('❌ Ошибка при добавлении: ' + res.status)
    }
  } catch (e) {
    alert('❌ Ошибка: ' + e.message)
  }
})

el('cancel-add-product').addEventListener('click', () => {
  el('prod-name').value = ''
  el('prod-price').value = ''
  el('prod-desc').value = ''
})

el('save-edit-product').addEventListener('click', async () => {
  if (!currentEditProduct) return
  
  const name = el('edit-prod-name').value.trim()
  const price = parseFloat(el('edit-prod-price').value)
  const desc = el('edit-prod-desc').value.trim()
  
  if (!name) { alert('⚠️ Введите название'); return }
  if (!price || price <= 0) { alert('⚠️ Введите корректную цену'); return }
  if (!desc) { alert('⚠️ Введите описание'); return }
  
  try {
    const res = await fetch(API_P + `/products/${currentEditProduct}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'admin_token': el('admintoken').value
      },
      body: JSON.stringify({ name, price, description: desc })
    })
    
    if (res.ok) {
      alert('✅ Лекарство обновлено успешно!')
      closeEditModal()
      loadAll()
    } else {
      alert('❌ Ошибка при обновлении: ' + res.status)
    }
  } catch (e) {
    alert('❌ Ошибка: ' + e.message)
  }
})

// ===== ORDERS =====
function renderOrdersList(orders) {
  const container = el('orders-list')
  
  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📭 Нет заказов</p></div>'
    return
  }
  
  const table = document.createElement('table')
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID Заказа</th>
        <th>Клиент</th>
        <th>Лекарства</th>
        <th>Доставка</th>
        <th>Статус</th>
        <th>Дата</th>
        <th>Контакты</th>
      </tr>
    </thead>
  `
  
  const tbody = document.createElement('tbody')
  orders.forEach(o => {
    const items = (o.items || []).map(i => {
      if (typeof i === 'object' && i.name) return i.name
      return i
    }).join(', ')
    
    const tr = document.createElement('tr')
    const createdAt = o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : 'N/A'
    const phone = o.phone || 'N/A'
    const email = o.email || 'N/A'
    
    tr.innerHTML = `
      <td><strong>#${o.id.slice(0, 8)}</strong></td>
      <td>${o.user_id || 'Гость'}</td>
      <td>${items}</td>
      <td>${o.fulfillment === 'delivery' ? '🚚 Доставка' : '🏪 Самовывоз'}</td>
      <td><span class="status-badge status-${o.status === 'completed' ? 'completed' : 'pending'}">${o.status === 'completed' ? '✅ Выполнен' : '⏳ В обработке'}</span></td>
      <td>${createdAt}</td>
      <td><small>📞 ${phone}<br/>📧 ${email}</small></td>
    `
    tbody.appendChild(tr)
  })
  
  table.appendChild(tbody)
  container.innerHTML = ''
  container.appendChild(table)
}

// ===== USERS =====
function renderUsersList(users) {
  const container = el('users-list')
  
  if (!users || users.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📭 Нет пользователей</p></div>'
    return
  }
  
  const table = document.createElement('table')
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Email</th>
        <th>Имя</th>
        <th>Дата регистрации</th>
      </tr>
    </thead>
  `
  
  const tbody = document.createElement('tbody')
  users.forEach(u => {
    const tr = document.createElement('tr')
    const createdAt = u.created_at ? new Date(u.created_at).toLocaleString('ru-RU') : 'N/A'
    tr.innerHTML = `
      <td><strong>${u.id.slice(0, 8)}</strong></td>
      <td>${u.email}</td>
      <td>${u.name || 'Не указано'}</td>
      <td>${createdAt}</td>
    `
    tbody.appendChild(tr)
  })
  
  table.appendChild(tbody)
  container.innerHTML = ''
  container.appendChild(table)
}

// ===== PHARMACIES =====
function renderPharmaciesList(pharmacies) {
  const container = el('pharmacies-list')
  
  if (!pharmacies || pharmacies.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📭 Нет аптек. Создайте первую аптеку!</p></div>'
    return
  }
  
  const table = document.createElement('table')
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Название</th>
        <th>Адрес</th>
      </tr>
    </thead>
  `
  
  const tbody = document.createElement('tbody')
  pharmacies.forEach(p => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>#${p.id}</strong></td>
      <td>🏪 ${p.name}</td>
      <td>📍 ${p.address}</td>
    `
    tbody.appendChild(tr)
  })
  
  table.appendChild(tbody)
  container.innerHTML = ''
  container.appendChild(table)
}

el('create-pharmacy').addEventListener('click', async () => {
  const name = el('ph-name').value.trim()
  const address = el('ph-address').value.trim()
  
  if (!name) { alert('⚠️ Введите название аптеки'); return }
  if (!address) { alert('⚠️ Введите адрес'); return }
  
  try {
    const res = await fetch(API_P + '/pharmacies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'admin_token': el('admintoken').value
      },
      body: JSON.stringify({ name, address })
    })
    
    if (res.ok) {
      alert('✅ Аптека создана успешно!')
      el('ph-name').value = ''
      el('ph-address').value = ''
      loadAll()
    } else {
      alert('❌ Ошибка при создании: ' + res.status)
    }
  } catch (e) {
    alert('❌ Ошибка: ' + e.message)
  }
})

// ===== MAIN LOAD =====
async function loadAll() {
  try {
    const [products, orders, users, pharmacies] = await Promise.all([
      fetch(API_P + '/products').then(r => r.json()),
      fetch(API_O + '/orders').then(r => r.json()),
      fetch(API_U + '/users', { headers: { 'admin_token': el('admintoken').value } }).then(r => r.ok ? r.json() : []),
      fetch(API_P + '/pharmacies').then(r => r.json())
    ])
    
    renderProductsList(products)
    renderOrdersList(orders)
    renderUsersList(users)
    renderPharmaciesList(pharmacies)
  } catch (e) {
    console.error('Ошибка загрузки:', e)
  }
}

el('refresh').addEventListener('click', loadAll)

// Initial load
loadAll()
