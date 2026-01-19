const API_PRODUCTS = 'http://localhost:3001'
const API_USERS = 'http://localhost:3002'
const API_ORDERS = 'http://localhost:3003'

let cart = []
let allProducts = []

function token(){return localStorage.getItem('token')}
function setToken(t){ if(t) localStorage.setItem('token',t); else localStorage.removeItem('token') }

// Cart persistence
function loadCart(){
  const saved = localStorage.getItem('cart')
  if(saved){
    try {
      cart = JSON.parse(saved)
      console.log('✅ Корзина загружена из памяти:', cart.length, 'товаров')
    } catch(e){
      console.error('❌ Ошибка загрузки корзины:', e)
      cart = []
    }
  }
}

function saveCart(){
  localStorage.setItem('cart', JSON.stringify(cart))
  console.log('💾 Корзина сохранена:', cart.length, 'товаров')
}

// Update user status in navbar
function updateUserStatus(){
  const status = document.getElementById('user-status')
  if(!status) return
  if(token()){
    status.innerHTML = '<span style="font-weight:600">👤 Вход</span> | <a href="#" onclick="logout()" style="color:#ff6b35;text-decoration:none">Выход</a>'
  } else {
    status.innerHTML = '<a href="/login.html" style="color:#0066cc;text-decoration:none;margin-right:1rem">Вход</a> <a href="/register.html" style="color:#0066cc;text-decoration:none">Регистрация</a>'
  }
}

function logout(){
  setToken(null)
  updateUserStatus()
  cart = []
  localStorage.removeItem('cart')
  renderCart()
}

// Cart modal control
const modal = document.getElementById('cart-modal')
if(modal){
  document.getElementById('cart-btn').addEventListener('click', ()=>{
    modal.classList.add('active')
  })
  document.querySelector('.close-btn').addEventListener('click', ()=>{
    modal.classList.remove('active')
  })
  modal.addEventListener('click', (e)=>{
    if(e.target === modal) modal.classList.remove('active')
  })
}

async function loadProducts(){
  try {
    const res = await fetch(`${API_PRODUCTS}/products`)
    if(!res.ok) throw new Error(`API error: ${res.status}`)
    allProducts = await res.json()
    console.log('✅ Товары загружены:', allProducts.length, allProducts)
    renderProductList()
  } catch(e) {
    console.error('❌ Ошибка загрузки товаров:', e)
    document.getElementById('products').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:#ef4444">❌ Ошибка загрузки товаров</div>'
  }
}

function renderProductList(){
  const q = (document.getElementById('search')?.value||'').toLowerCase()
  const min = parseFloat(document.getElementById('minprice')?.value||'')
  const max = parseFloat(document.getElementById('maxprice')?.value||'')
  const sort = document.getElementById('sort')?.value || 'relevance'

  let filtered = allProducts.filter(p=>{
    if(q){
      if(!(p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q))) return false
    }
    if(!isNaN(min) && min>0 && p.price < min) return false
    if(!isNaN(max) && max>0 && p.price > max) return false
    return true
  })

  if(sort==='price-asc') filtered.sort((a,b)=>a.price-b.price)
  if(sort==='price-desc') filtered.sort((a,b)=>b.price-a.price)

  const container = document.getElementById('products')
  if(!container) return
  
  container.innerHTML = ''
  if(filtered.length === 0){
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:#6b7280">Лекарства не найдены</div>'
    return
  }
  
  filtered.forEach(p=>{
    const card = document.createElement('div')
    card.className = 'product-card'
    card.innerHTML = `
      <div class="product-image">💊</div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description||'Качественное лекарство'}</div>
        <div class="product-price">${p.price} ₽</div>
        <div class="product-actions">
          <button class="btn-add" data-id="${p.id}">🛒 Добавить</button>
        </div>
      </div>
    `
    container.appendChild(card)
  })
  
  container.querySelectorAll('.btn-add').forEach(b=>b.addEventListener('click', (e)=>{
    e.preventDefault()
    const id = b.getAttribute('data-id')
    const p = allProducts.find(x=>x.id==id)
    if(p) {
      cart.push(p)
      saveCart()
      console.log('✅ Добавлено в корзину:', p.name, 'Товаров в корзине:', cart.length)
      renderCart()
    }
  }))
}

function renderCart(){
  const items = document.getElementById('cart-items')
  const count = document.getElementById('cart-count')
  if(!items || !count) return
  
  count.innerText = cart.length
  
  if(cart.length === 0){
    items.innerHTML = '<div class="cart-empty">Ваша корзина пуста</div>'
    return
  }
  
  items.innerHTML = ''
  cart.forEach((item, idx)=>{
    const cartItem = document.createElement('div')
    cartItem.className = 'cart-item'
    cartItem.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${item.price} ₽</div>
      </div>
      <button class="cart-item-remove" data-idx="${idx}">🗑️ Удалить</button>
    `
    items.appendChild(cartItem)
  })
  
  document.querySelectorAll('.cart-item-remove').forEach(b=>{
    b.addEventListener('click', ()=>{
      cart.splice(+b.getAttribute('data-idx'), 1)
      saveCart()
      renderCart()
    })
  })
}

const checkoutBtn = document.getElementById('to-checkout')
if(checkoutBtn){
  checkoutBtn.addEventListener('click', async ()=>{
    if(!token()){
      alert('Пожалуйста, войдите в систему')
      window.location.href = '/login.html'
      return
    }
    
    if(!cart.length) {
      alert('Корзина пуста')
      return
    }
    
    console.log('📤 Отправляем корзину на checkout:', cart)
    
    // Save cart to sessionStorage for checkout page
    sessionStorage.setItem('checkout_cart', JSON.stringify(cart))
    sessionStorage.setItem('checkout_fulfillment', 'delivery')
    
    // Close modal and redirect
    const modal = document.getElementById('cart-modal')
    if(modal) modal.classList.remove('active')
    
    window.location.href = '/checkout.html'
  })
}

// wire search/filter controls
document.getElementById('search')?.addEventListener('input', renderProductList)
document.getElementById('minprice')?.addEventListener('input', renderProductList)
document.getElementById('maxprice')?.addEventListener('input', renderProductList)
document.getElementById('sort')?.addEventListener('change', renderProductList)

// Initialize
loadCart()
renderCart()
updateUserStatus()
if(document.getElementById('products')){
  loadProducts().catch(e=>console.error(e))
}
