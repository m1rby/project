#  Pharmacy - Полнофункциональная аптечная платформа

Полноценная микросервисная архитектура для онлайн-аптеки с профессиональным интерфейсом, системой управления лекарствами.

##  Архитектура

Система состоит из **4 микросервисов** и **PostgreSQL** базы данных:

### Сервисы:
- ** Product Service (порт 3001)** - Управление каталогом лекарств и аптеками
- ** User Service (порт 3002)** - Регистрация, аутентификация, JWT токены
- ** Order Service (порт 3003)** - Обработка заказов и история покупок
- ** Frontend (порт 3000)** - Веб-интерфейс на HTML/CSS/JavaScript



##  Быстрый старт с Docker Compose

```powershell
cd e:\Pharmacy
docker-compose up --build
```

Откройте в браузере:
- **Магазин**: http://localhost:3000
- **Админ**: http://localhost:3000/admin






##  API Endpoints

### Products
- `GET /products` - получить все лекарства
- `POST /products` - создать (требует admin_token)
- `PUT /products/:id` - обновить (требует admin_token)
- `DELETE /products/:id` - удалить (требует admin_token)
- `GET /pharmacies` - получить аптеки
- `POST /pharmacies` - создать аптеку (требует admin_token)

### Users
- `POST /register` - регистрация
- `POST /login` - вход
- `GET /me` - текущий пользователь (требует Bearer токен)
- `GET /users` - все пользователи (требует admin_token)

### Orders
- `GET /orders` - все заказы
- `POST /orders` - создать заказ (требует Bearer токен)


##  Технологический стек

- **Backend**: Node.js + Express.js
- **БД**: PostgreSQL 15
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Аутентификация**: JWT + bcryptjs
- **Контейнеризация**: Docker + Docker Compose
- **API**: REST с CORS

##  Структура проекта

```
Pharmacy/
├── product-service/          # Сервис лекарств
│   ├── package.json
│   └── index.js
├── user-service/             # Сервис пользователей
│   ├── package.json
│   └── index.js
├── order-service/            # Сервис заказов
│   ├── package.json
│   └── index.js
├── frontend/                 # Веб-интерфейс
│   ├── package.json
│   ├── index.html           # Главная страница магазина
│   ├── login.html           # Вход
│   ├── register.html        # Регистрация
│   ├── checkout.html        # Оформление заказа
│   ├── profile.html         # Профиль пользователя
│   ├── admin.html           # Админ-панель
│   ├── app.js               # Основной скрипт магазина
│   ├── admin.js             # Скрипт админ-панели
│   └── styles.css           # Стили
├── docker-compose.yml        # Конфигурация Docker
└── README.md                 # Этот файл
```

---
