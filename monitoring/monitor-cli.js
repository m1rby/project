#!/usr/bin/env node

/**
 * CLI утилита для запуска мониторинга
 * Использование: node monitor-cli.js [command] [options]
 * 
 * Команды:
 *   start     - Запустить live мониторинг
 *   stats     - Вывести текущую статистику и выход
 *   logs      - Показать последние логи
 *   export    - Экспортировать метрики в JSON
 */

const Monitor = require('./monitor');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const monitor = new Monitor();
const command = process.argv[2] || 'start';
const option = process.argv[3];

switch (command) {
  case 'start':
    // Live мониторинг
    const interval = option ? parseInt(option) : 5;
    monitor.startMonitoring(interval);
    break;

  case 'stats':
    // Одноразывый вывод статистики
    console.log('\n📊 СТАТИСТИКА СИСТЕМЫ\n');
    console.log(JSON.stringify(monitor.getOverallStats(), null, 2));
    process.exit(0);
    break;

  case 'logs':
    // Показать последние логи
    showRecentLogs(option || 10);
    break;

  case 'export':
    // Экспортировать метрики
    exportMetrics(option || 'metrics-export.json');
    break;

  case 'help':
    showHelp();
    break;

  default:
    console.log(`❌ Неизвестная команда: ${command}`);
    showHelp();
    process.exit(1);
}

/**
 * Показывает последние логи
 */
function showRecentLogs(count) {
  const logsDir = path.join(__dirname, '../logs');
  const allLogs = [];

  // Читаем все лог файлы
  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir);

    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        lines.forEach(line => {
          try {
            allLogs.push(JSON.parse(line));
          } catch (e) {
            // Пропускаем некорректные строки
          }
        });
      }
    });
  }

  // Сортируем по времени и берем последние
  const recent = allLogs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, count);

  console.log(`\n📋 ПОСЛЕДНИЕ ${count} ЛОГОВ:\n`);

  recent.forEach((log, idx) => {
    const prefix = getPrefix(log.level);
    console.log(`${idx + 1}. ${prefix}[${log.timestamp}] [${log.service}] ${log.message}`);
    if (Object.keys(log.data).length > 0) {
      console.log(`   Data: ${JSON.stringify(log.data)}`);
    }
  });

  console.log();
  process.exit(0);
}

/**
 * Экспортирует метрики в JSON файл
 */
function exportMetrics(filename) {
  const stats = monitor.getOverallStats();
  const filepath = path.join(__dirname, '../', filename);

  fs.writeFileSync(filepath, JSON.stringify(stats, null, 2));
  console.log(`✅ Метрики экспортированы в: ${filepath}`);
  process.exit(0);
}

/**
 * Показывает справку
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           СИСТЕМА МОНИТОРИНГА ФАРМАЦЕВТИЧЕСКОГО E-COMMERCE║
╚════════════════════════════════════════════════════════════╝

ИСПОЛЬЗОВАНИЕ:
  node monitoring/monitor-cli.js [команда] [опции]

КОМАНДЫ:

  start [интервал]  - Запустить live мониторинг
                     интервал = период обновления в секундах (по умолчанию 5)
                     Пример: node monitoring/monitor-cli.js start 3

  stats             - Вывести текущую статистику и выход
                     Пример: node monitoring/monitor-cli.js stats

  logs [количество] - Показать последние логи
                     количество = сколько логов показать (по умолчанию 10)
                     Пример: node monitoring/monitor-cli.js logs 20

  export [файл]     - Экспортировать метрики в JSON
                     файл = имя файла для экспорта
                     Пример: node monitoring/monitor-cli.js export stats.json

  help              - Показать эту справку

ПРИМЕРЫ:

  # Запустить мониторинг с обновлением каждые 5 секунд
  node monitoring/monitor-cli.js start

  # Запустить мониторинг с обновлением каждые 2 секунды
  node monitoring/monitor-cli.js start 2

  # Показать текущую статистику
  node monitoring/monitor-cli.js stats

  # Показать последние 20 логов
  node monitoring/monitor-cli.js logs 20

  # Экспортировать метрики
  node monitoring/monitor-cli.js export metrics.json

📊 МЕТРИКИ, КОТОРЫЕ ОТСЛЕЖИВАЮТСЯ:

  • HTTP запросы (время ответа, статус коды)
  • Ошибки системы (количество и причины)
  • Аутентификация (успешность попыток входа)
  • Заказы (количество и статистика)
  • База данных (время запросов, медленные запросы)

🔍 ЛОГИ ХРАНЯТСЯ В:
  ./logs/

📁 СТРУКТУРА ЛОГОВ:
  • logs/[сервис].log     - Логи каждого сервиса
  • logs/metrics.log      - Файл метрик для мониторинга

`);
}

function getPrefix(level) {
  const colors = {
    'INFO': '\x1b[36m',
    'ERROR': '\x1b[31m',
    'WARN': '\x1b[33m',
    'DEBUG': '\x1b[35m'
  };
  const reset = '\x1b[0m';
  return (colors[level] || '') + `[${level}]${reset}`;
}
