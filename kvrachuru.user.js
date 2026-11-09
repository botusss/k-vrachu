// ==UserScript==
// @name         zapis k-vrachu ru
// @namespace    kvrachuru
// @version      1.0.1
// @description  Умная запись, автоматическое бронирование талонов и проверка успеха записи на k-vrachu.ru
// @author       Vit O
// @license      MIT
// @match        https://k-vrachu.ru/*
// @match        https://*.k-vrachu.ru/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==
 
 
(function() {
    'use strict';
 
    // Функция генерации рандомной задержки (от minMs до maxMs)
    function getRandomDelay(minMs = 2800, maxMs = 4200) {
        return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    }
 
    let isRunning = localStorage.getItem('tm_bot_running') === 'true';
    let rawTimeRanges = localStorage.getItem('tm_bot_ranges') || ''; // По умолчанию пустое
    let targetUrl = localStorage.getItem('tm_bot_target_url') || '';
 
    const isTimetablePage = window.location.href.includes('/timetable');
 
    // Логирование с сохранением в localStorage
    function logToPanel(message) {
        console.log(`[Bot Log] ${message}`);
 
        const timeStr = new Date().toLocaleTimeString();
        const logLine = `<span style="color: #95a5a6; font-size: 10px;">[${timeStr}]</span> ${message}`;
 
        let savedLogs = [];
        try {
            savedLogs = JSON.parse(localStorage.getItem('tm_bot_logs') || '[]');
        } catch (e) {
            savedLogs = [];
        }
 
        savedLogs.push(logLine);
        if (savedLogs.length > 15) {
            savedLogs.shift();
        }
        localStorage.setItem('tm_bot_logs', JSON.stringify(savedLogs));
 
        updateLogContainerDOM();
    }
 
    // Отрисовка логов в DOM
    function updateLogContainerDOM() {
        const logContainer = document.getElementById('tm_log_container');
        if (!logContainer) return;
 
        try {
            const savedLogs = JSON.parse(localStorage.getItem('tm_bot_logs') || '[]');
            logContainer.innerHTML = savedLogs.map(item => `<div style="margin-bottom: 3px; border-bottom: 1px solid #34495e; padding-bottom: 2px;">${item}</div>`).join('');
            logContainer.scrollTop = logContainer.scrollHeight;
        } catch (e) {}
    }
 
    function playAlertSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.connect(audioCtx.destination);
            osc.start();
            setTimeout(() => osc.stop(), 3000);
        } catch (e) {}
    }
 
    // Конвертация строки времени ("10:30" или "10") в общее количество минут от начала суток
    function timeToMinutes(str) {
        str = str.trim();
        if (str.includes(':')) {
            const parts = str.split(':');
            const h = parseInt(parts[0]) || 0;
            const m = parseInt(parts[1]) || 0;
            return h * 60 + m;
        } else {
            const h = parseInt(str) || 0;
            return h * 60;
        }
    }
 
    // Парсинг диапазонов (поддерживает "10:30-12:15" и старый формат "10-12")
    function parseTimeRanges(str) {
        if (!str || !str.trim()) return [];
        const ranges = [];
        const parts = str.split(',');
 
        for (let part of parts) {
            const bounds = part.split('-');
            if (bounds.length === 2) {
                const startMin = timeToMinutes(bounds[0]);
                const endMin = timeToMinutes(bounds[1]);
                ranges.push({
                    start: Math.min(startMin, endMin),
                    end: Math.max(startMin, endMin)
                });
            }
        }
        return ranges;
    }
 
    // Остановка бота при успехе или блокировке
    function stopBot(statusMsg) {
        isRunning = false;
        localStorage.setItem('tm_bot_running', false);
 
        const btnToggle = document.getElementById('tm_btn_toggle');
        const statusText = document.getElementById('tm_status_text');
        if (btnToggle && statusText) {
            btnToggle.innerText = '🚀 Начать поиск';
            btnToggle.style.backgroundColor = '#2ecc71';
            statusText.innerText = statusMsg;
        }
    }
 
    // Панель управления создается ТОЛЬКО на страницах расписания (/timetable)
    function createControlPanel() {
        if (!isTimetablePage || document.getElementById('tm-control-panel')) return;
 
        const panel = document.createElement('div');
        panel.id = 'tm-control-panel';
        panel.style.position = 'fixed';
        panel.style.bottom = '20px';
        panel.style.right = '20px';
        panel.style.zIndex = '999999';
        panel.style.padding = '15px';
        panel.style.borderRadius = '12px';
        panel.style.backgroundColor = '#2c3e50';
        panel.style.color = '#fff';
        panel.style.fontFamily = 'Arial, sans-serif';
        panel.style.fontSize = '13px';
        panel.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
        panel.style.minWidth = '280px';
        panel.style.maxWidth = '320px';
 
        panel.innerHTML = `
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #455a64; padding-bottom: 6px;">
                <span>🤖 Помощник записи</span>
                <a href="https://vk.ru/osievich" target="_blank" title="Связаться с автором / Помощь" style="background: #34495e; color: #fff; text-decoration: none; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px; font-weight: bold; border: 1px solid #7f8c8d; cursor: pointer;">?</a>
            </div>
 
            <div style="margin-bottom: 6px;">
                <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ecf0f1;">Интервалы (чч:мм):</label>
                <input type="text" id="tm_ranges_input" value="${rawTimeRanges}" placeholder="например: 10:30-12:15, 14-16" style="width: 100%; box-sizing: border-box; padding: 5px 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 12px; color: #000;">
                <div style="font-size: 10px; color: #95a5a6; margin-top: 3px;">Пусто = любое время</div>
            </div>
 
            <div id="tm_status_text" style="font-size: 11px; margin: 8px 0; color: #bdc3c7; text-align: center;">
                ${isRunning ? '⏳ Статус: Поиск активен' : '⏸️ Статус: Остановлен'}
            </div>
 
            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <button id="tm_btn_toggle" style="flex: 1; padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; color: white; background-color: ${isRunning ? '#e74c3c' : '#2ecc71'};">
                    ${isRunning ? '⏸️ Стоп' : '🚀 Начать поиск'}
                </button>
            </div>
 
            <div style="font-size: 11px; color: #ecf0f1; border-top: 1px solid #455a64; margin-top: 6px; padding-top: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 10px; color: #95a5a6; font-weight: bold;">📜 Лог событий:</span>
                    <button id="tm_btn_clear_logs" style="background: transparent; border: none; color: #95a5a6; font-size: 9px; cursor: pointer; text-decoration: underline;" title="Очистить лог">очистить</button>
                </div>
                <div id="tm_log_container" style="background: #1a252f; border: 1px solid #34495e; border-radius: 6px; padding: 6px; height: 100px; overflow-y: auto; font-family: monospace; font-size: 10px; line-height: 1.3;">
                </div>
            </div>
        `;
 
        document.body.appendChild(panel);
        updateLogContainerDOM();
 
        const btnToggle = document.getElementById('tm_btn_toggle');
        const inputRanges = document.getElementById('tm_ranges_input');
        const statusText = document.getElementById('tm_status_text');
        const btnClearLogs = document.getElementById('tm_btn_clear_logs');
 
        btnClearLogs.addEventListener('click', () => {
            localStorage.removeItem('tm_bot_logs');
            updateLogContainerDOM();
        });
 
        inputRanges.addEventListener('change', () => {
            rawTimeRanges = inputRanges.value.trim();
            localStorage.setItem('tm_bot_ranges', rawTimeRanges);
            logToPanel(`⏱️ Интервалы изменены: "${rawTimeRanges || 'Любое'}"`);
        });
 
        btnToggle.addEventListener('click', () => {
            isRunning = !isRunning;
            localStorage.setItem('tm_bot_running', isRunning);
 
            if (isRunning) {
                targetUrl = window.location.href;
                localStorage.setItem('tm_bot_target_url', targetUrl);
 
                btnToggle.innerText = '⏸️ Стоп';
                btnToggle.style.backgroundColor = '#e74c3c';
                statusText.innerText = '⏳ Статус: Поиск активен';
                logToPanel('🚀 Поиск запущен пользователем');
                runSearchLogic();
            } else {
                btnToggle.innerText = '🚀 Начать поиск';
                btnToggle.style.backgroundColor = '#2ecc71';
                statusText.innerText = '⏸️ Статус: Остановлен';
                logToPanel('⏸️ Поиск остановлен пользователем');
            }
        });
    }
 
    // Проверка успешной брони ИЛИ ошибки "Уже записаны"
    function checkPageStatus() {
        // 1. Проверка успешного талона
        const reservedSlots = document.querySelectorAll('table.timeTable td.reserved, table.timeTable td.btnCancelRecord');
        if (reservedSlots.length > 0) {
            const lastSlot = localStorage.getItem('tm_bot_last_slot') || '';
            const successMsg = lastSlot ? `🎉 ЗАПИСЬ ПОДТВЕРЖДЕНА на ${lastSlot}!` : '🎉 ЗАПИСЬ ПОДТВЕРЖДЕНА!';
            logToPanel(successMsg);
            playAlertSound();
            stopBot('🎉 Запись успешна!');
            return true;
        }
 
        // 2. Универсальная проверка сообщения "уже записаны"
        const alerts = document.querySelectorAll('.alert, .contextAlert, .infoWindow');
        for (let alertEl of alerts) {
            const text = alertEl.textContent.toLowerCase();
            if (text.includes('уже записаны')) {
                logToPanel('⚠️ ВНИМАНИЕ: Вы уже записаны по данному профилю! Поиск остановлен.');
                playAlertSound();
                stopBot('🛑 Уже есть запись по профилю');
                return true;
            }
        }
 
        return false;
    }
 
    // Автоподтверждение записи
    function handleConfirmationModal() {
        setInterval(() => {
            if (!isRunning || !isTimetablePage) return;
 
            const modal = document.querySelector('.regAgree-free-inside');
            if (!modal || modal.offsetWidth === 0) return;
 
            const checkbox = document.querySelector('#regAgree_rules');
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                checkbox.checked = true;
                logToPanel('✅ Поставлена галочка согласия');
            }
 
            const confirmBtn = document.querySelector('a.button.record-button');
            if (confirmBtn) {
                if (!confirmBtn.classList.contains('disabled')) {
                    logToPanel('🎉 Нажимаем кнопку подтверждения записи...');
                    playAlertSound();
                    confirmBtn.click();
 
                    setTimeout(() => {
                        if (isRunning) location.reload();
                    }, 2000);
                } else {
                    confirmBtn.classList.remove('disabled');
                }
            }
        }, 200);
    }
 
    // Обработка окна "Талон занят"
    function handleErrorModal() {
        setInterval(() => {
            if (!isRunning || !isTimetablePage) return;
 
            const errorPopup = document.querySelector('div.popup.infoWindow');
            if (!errorPopup || errorPopup.offsetWidth === 0) return;
 
            const alertText = errorPopup.querySelector('.contextAlert');
            if (alertText && alertText.textContent.includes('занято')) {
                logToPanel('⚠️ Талон успели занять. Перезагрузка...');
 
                const closeBtn = errorPopup.querySelector('span.close');
                if (closeBtn) closeBtn.click();
 
                const delay = getRandomDelay(1000, 2000);
                setTimeout(() => {
                    if (isRunning) location.reload();
                }, delay);
            }
        }, 300);
    }
 
    // Основная логика поиска
    function runSearchLogic() {
        if (!isRunning || !isTimetablePage) return;
 
        if (checkPageStatus()) return;
 
        const table = document.querySelector('table.timeTable');
        const nextDelay = getRandomDelay();
 
        if (!table) {
            logToPanel(`🔍 Расписание не загрузилось. Пауза ${(nextDelay/1000).toFixed(1)}с...`);
            setTimeout(() => {
                if (isRunning) location.reload();
            }, nextDelay);
            return;
        }
 
        const allFree = Array.from(document.querySelectorAll('table.timeTable td.free[data-timetablegraf_begtime]'));
 
        const realInPersonSlots = allFree.filter(slot => {
            const typeId = slot.getAttribute('data-timetabletype_id');
            const altText = (slot.getAttribute('alt') || '').toLowerCase();
            const descText = (slot.getAttribute('desc') || '').toLowerCase();
            const htmlContent = slot.innerHTML.toLowerCase();
 
            const isHomeCall = altText.includes('вызова на дом') || descText.includes('вызова на дом');
            const isOnline = htmlContent.includes('<svg') || htmlContent.includes('<img') || typeId !== '1';
 
            return !isHomeCall && !isOnline;
        });
 
        if (realInPersonSlots.length > 0) {
            realInPersonSlots.sort((a, b) => {
                const timeA = new Date(a.getAttribute('data-timetablegraf_begtime')).getTime();
                const timeB = new Date(b.getAttribute('data-timetablegraf_begtime')).getTime();
                return timeA - timeB;
            });
 
            const parsedRanges = parseTimeRanges(rawTimeRanges);
            let targetSlot = null;
 
            if (parsedRanges.length > 0) {
                targetSlot = realInPersonSlots.find(slot => {
                    const dateTimeStr = slot.getAttribute('data-timetablegraf_begtime');
                    const slotDate = new Date(dateTimeStr);
                    const slotMinutes = slotDate.getHours() * 60 + slotDate.getMinutes();
                    return parsedRanges.some(r => slotMinutes >= r.start && slotMinutes <= r.end);
                });
            }
 
            if (!targetSlot) {
                targetSlot = realInPersonSlots[0];
                const slotFormat = targetSlot.getAttribute('data-timetablegraf_begtime_format') || 'ближайшее время';
                logToPanel(`💡 В интервале пусто. Берем ближайший: ${slotFormat}`);
            } else {
                const slotFormat = targetSlot.getAttribute('data-timetablegraf_begtime_format') || 'выбранное время';
                logToPanel(`🎯 Выбран слот: ${slotFormat}`);
            }
 
            const slotFormatStr = targetSlot.getAttribute('data-timetablegraf_begtime_format') || '';
            if (slotFormatStr) {
                localStorage.setItem('tm_bot_last_slot', slotFormatStr);
            }
 
            playAlertSound();
            targetSlot.click();
 
        } else {
            logToPanel(`⏳ Свободных очных талонов нет. Обновление через ${(nextDelay/1000).toFixed(1)}с...`);
            setTimeout(() => {
                if (isRunning) location.reload();
            }, nextDelay);
        }
    }
 
    function init() {
        if (isRunning && !isTimetablePage) {
            if (targetUrl) {
                logToPanel('↪️ Редирект в картотеку/другую страницу. Возвращаемся в расписание для проверки...');
                setTimeout(() => {
                    window.location.href = targetUrl;
                }, 1000);
                return;
            }
        }
 
        if (isTimetablePage) {
            createControlPanel();
            handleConfirmationModal();
            handleErrorModal();
 
            logToPanel('🛠️ Помощник загружен (v1.0.1)');
 
            if (isRunning) {
                logToPanel('▶️ Проверка расписания...');
                runSearchLogic();
            }
        }
    }
 
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
