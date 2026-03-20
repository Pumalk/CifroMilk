// Конфигурация и константы
const CONFIG = {
    densities: {
        milk: 1.030,
        skimmedMilk: 1.035, // Обрат
        cream: 1.015,       // Сливки 20%
    },
    fat: {
        skimmedMilk: 0.05,
        creamDefault: 20.0,
        sourCream: 20.0,
    },
    dryMatterSkimmedMilk: 8.5, // СВ обрата %
    moistureSkimmedCurd: 80.0, // Влажность обезжиренного творога %
    fatSkimmedCurd: 0.2,       // Жирность обезжиренного творога %
    spoons: {
        tspGram: 5,
        tbspGram: 15,
        tspMl: 5,
        tbspMl: 15,
    }
};

// Утилиты
function litersToKg(vol, density) {
    return vol * density;
}

function kgToLiters(mass, density) {
    return mass / density;
}

function formatNum(num, decimals = 2) {
    if (isNaN(num)) return "0";
    return Number(num).toFixed(decimals);
}

function getMilkData() {
    const data = localStorage.getItem('milkData');
    return data ? JSON.parse(data) : null;
}

function saveMilkData(data) {
    localStorage.setItem('milkData', JSON.stringify(data));
}

function addToJournal(entry) {
    let journal = JSON.parse(localStorage.getItem('journal') || '[]');
    entry.id = Date.now();
    entry.dateStr = new Date().toLocaleString('ru-RU');
    journal.unshift(entry); // Новые сверху
    localStorage.setItem('journal', JSON.stringify(journal));
}

function getJournal() {
    return JSON.parse(localStorage.getItem('journal') || '[]');
}

function clearJournal() {
    if(confirm('Вы уверены, что хотите очистить весь журнал?')) {
        localStorage.removeItem('journal');
        renderJournal();
    }
}

// Проверка наличия данных при загрузке страниц (кроме index и journal)
function checkMilkDataRedirect() {
    if (window.location.pathname.includes('index.html') || window.location.pathname.includes('journal.html')) return;
    
    const data = getMilkData();
    if (!data) {
        alert('Сначала введите исходные данные о молоке на главной странице!');
        window.location.href = 'index.html';
    }
    return data;
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // Инициализация страницы ввода
    if (path.includes('index.html') || path === '/' && !path.includes('.html')) {
        initIndex();
    }
    // Инициализация страницы молока
    else if (path.includes('milk.html')) {
        initMilk();
    }
    // Инициализация сепарирования
    else if (path.includes('separation.html')) {
        initSeparation();
    }
    // Инициализация творога
    else if (path.includes('cottagecheese.html')) {
        initCottageCheese();
    }
    // Инициализация сыра
    else if (path.includes('cheese.html')) {
        initCheese();
    }
    // Инициализация журнала
    else if (path.includes('journal.html')) {
        initJournal();
    }
});

// --- Логика страницы INDEX ---
function initIndex() {
    const form = document.getElementById('milkForm');
    const existingData = getMilkData();

    if (existingData) {
        document.getElementById('volume').value = existingData.volume;
        document.getElementById('fat').value = existingData.fat;
        document.getElementById('density').value = existingData.density;
        document.getElementById('protein').value = existingData.protein || '';
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const volume = parseFloat(document.getElementById('volume').value);
        const fat = parseFloat(document.getElementById('fat').value);
        const density = parseFloat(document.getElementById('density').value) || CONFIG.densities.milk;
        const protein = parseFloat(document.getElementById('protein').value);

        if (!volume || !fat || volume <= 0 || fat < 0) {
            alert('Пожалуйста, заполните обязательные поля корректно.');
            return;
        }

        const data = { volume, fat, density, protein };
        saveMilkData(data);
        
        const resultBox = document.getElementById('resultBox');
        resultBox.className = 'result-box success';
        resultBox.innerHTML = `<strong>Данные сохранены!</strong><br>Объём: ${volume} л, Жирность: ${fat}%, Плотность: ${density}`;
        resultBox.style.display = 'block';
    });
}

// --- Логика страницы MILK ---
function initMilk() {
    const milk = checkMilkDataRedirect();
    if (!milk) return;

    const targetFatSelect = document.getElementById('targetFatSelect');
    const customFatInput = document.getElementById('customFatInput');
    
    targetFatSelect.addEventListener('change', () => {
        if (targetFatSelect.value === 'custom') {
            customFatInput.classList.remove('hidden');
        } else {
            customFatInput.classList.add('hidden');
        }
    });

    document.getElementById('calcBtn').addEventListener('click', () => {
        const type = document.querySelector('input[name="milkType"]:checked').value;
        const losses = parseFloat(document.getElementById('losses').value) || 0;
        let targetFat = 0;

        if (type === 'normalized') {
            const selected = targetFatSelect.value;
            if (selected === 'custom') {
                targetFat = parseFloat(customFatInput.value);
            } else {
                targetFat = parseFloat(selected);
            }
        }

        const resultBox = document.getElementById('resultBox');
        
        // Валидация
        if (type === 'normalized' && (!targetFat || targetFat < 0)) {
            resultBox.className = 'result-box error';
            resultBox.innerHTML = 'Ошибка: Укажите корректную целевую жирность.';
            return;
        }

        let html = '';
        const massMilk = litersToKg(milk.volume, milk.density);
        
        if (type === 'whole') {
            const finalVol = milk.volume * (1 - losses / 100);
            const finalMass = massMilk * (1 - losses / 100);
            html = `
                <h3>Результат (Отборное молоко)</h3>
                <p>Итоговый объём: <strong>${formatNum(finalVol)} л</strong></p>
                <p>Итоговая масса: <strong>${formatNum(finalMass)} кг</strong></p>
                <p>Потери составили: ${losses}%</p>
            `;
        } else {
            // Нормализация (Квадрат Пирсона упрощенный через баланс массы)
            let addFat, addDensity, addName, addTypeRu;
            
            if (targetFat < milk.fat) {
                // Нужен обрат
                addFat = CONFIG.fat.skimmedMilk;
                addDensity = CONFIG.densities.skimmedMilk;
                addName = 'обрата';
                addTypeRu = 'обрат';
            } else if (targetFat > milk.fat) {
                // Нужны сливки
                addFat = CONFIG.fat.creamDefault;
                addDensity = CONFIG.densities.cream;
                addName = 'сливок (20%)';
                addTypeRu = 'сливки';
            } else {
                 resultBox.className = 'result-box warning';
                 resultBox.innerHTML = 'Целевая жирность совпадает с исходной. Добавки не требуются.';
                 return;
            }

            // Проверка невозможности (теоретически, если цель ниже обрата или выше сливок)
            if (targetFat < addFat || (addTypeRu === 'сливки' && targetFat > addFat)) {
                 // Упрощенная проверка: если цель меньше жира добавки (для случая добавления сливок это ок, для обрата - нет)
                 // Главное ограничение: нельзя получить жирность ниже жира обрата (0.05) или выше жира сливок (20), если смешиваем только их.
                 if (targetFat < CONFIG.fat.skimmedMilk || targetFat > CONFIG.fat.creamDefault) {
                     resultBox.className = 'result-box error';
                     resultBox.innerHTML = `Невозможно достичь жирности ${targetFat}% используя доступные компоненты (диапазон ${CONFIG.fat.skimmedMilk}-${CONFIG.fat.creamDefault}%).`;
                     return;
                 }
            }

            // Расчет массы добавки: M_dob = M_mol * (J_mol - J_target) / (J_target - J_dob)
            // Внимание: формула работает, если знаменатель не 0.
            const massAdd = massMilk * (milk.fat - targetFat) / (targetFat - addFat);
            
            if (massAdd < 0) {
                 // Это значит, что направление выбрано неверно логикой выше, но на всякий случай
                 resultBox.className = 'result-box error';
                 resultBox.innerHTML = 'Ошибка расчёта: проверьте входные данные.';
                 return;
            }

            const volAdd = kgToLiters(massAdd, addDensity);
            const totalMass = massMilk + massAdd;
            const totalVol = milk.volume + volAdd;

            const finalMass = totalMass * (1 - losses / 100);
            const finalVol = totalVol * (1 - losses / 100);

            html = `
                <h3>Результат (Нормализованное молоко)</h3>
                <p class="highlight">Добавьте: <strong>${formatNum(volAdd)} л</strong> (${formatNum(massAdd)} кг) <em>${addName}</em>.</p>
                <div class="table-responsive">
                    <table>
                        <tr><th>Этап</th><th>Объём (л)</th><th>Масса (кг)</th></tr>
                        <tr><td>Исходное молоко</td><td>${formatNum(milk.volume)}</td><td>${formatNum(massMilk)}</td></tr>
                        <tr><td>Добавка (${addTypeRu})</td><td>${formatNum(volAdd)}</td><td>${formatNum(massAdd)}</td></tr>
                        <tr><td><strong>Смесь до потерь</strong></td><td><strong>${formatNum(totalVol)}</strong></td><td><strong>${formatNum(totalMass)}</strong></td></tr>
                        <tr><td><strong>Готовый продукт</strong> (потери ${losses}%)</td><td><strong>${formatNum(finalVol)}</strong></td><td><strong>${formatNum(finalMass)}</strong></td></tr>
                    </table>
                </div>
            `;
        }

        resultBox.className = 'result-box success';
        resultBox.innerHTML = html;
        
        // Кнопка сохранения
        const saveBtn = document.getElementById('saveJournalBtn');
        saveBtn.onclick = () => {
            addToJournal({
                type: 'milk',
                input: { ...milk, type, targetFat, losses },
                results: { html } // Сохраняем HTML для простоты отображения или пересчитываем
            });
            alert('Расчёт сохранён в журнал!');
        };
        saveBtn.style.display = 'inline-block';
    });
}

// --- Логика страницы SEPARATION ---
function initSeparation() {
    const milk = checkMilkDataRedirect();
    if (!milk) return;

    document.getElementById('calcBtn').addEventListener('click', () => {
        const creamFat = parseFloat(document.getElementById('creamFat').value) || CONFIG.fat.creamDefault;
        const creamDen = parseFloat(document.getElementById('creamDen').value) || CONFIG.densities.cream;
        const skimDen = parseFloat(document.getElementById('skimDen').value) || CONFIG.densities.skimmedMilk;
        const makeSourCream = document.getElementById('makeSourCream').checked;

        const massMilk = litersToKg(milk.volume, milk.density);
        const fatSkim = CONFIG.fat.skimmedMilk;

        // Масса сливок: M_sl = M_mol * (J_mol - J_skim) / (J_sl - J_skim)
        const massCream = massMilk * (milk.fat - fatSkim) / (creamFat - fatSkim);
        
        if (massCream < 0 || massCream > massMilk) {
             const resBox = document.getElementById('resultBox');
             resBox.className = 'result-box error';
             resBox.innerHTML = 'Ошибка: Жирность сливок должна быть выше жирности молока и обрата.';
             return;
        }

        const massSkim = massMilk - massCream;
        const volCream = kgToLiters(massCream, creamDen);
        const volSkim = kgToLiters(massSkim, skimDen);

        let sourHtml = '';
        if (makeSourCream) {
            sourHtml = `<p>Объём сметаны (из сливок): <strong>${formatNum(volCream)} л</strong></p>`;
        }

        const html = `
            <h3>Результаты сепарирования</h3>
            <div class="table-responsive">
                <table>
                    <tr><th>Продукт</th><th>Масса (кг)</th><th>Объём (л)</th></tr>
                    <tr><td>Сливки (${creamFat}%)</td><td>${formatNum(massCream)}</td><td>${formatNum(volCream)}</td></tr>
                    <tr><td>Обрат (${fatSkim}%)</td><td>${formatNum(massSkim)}</td><td>${formatNum(volSkim)}</td></tr>
                </table>
            </div>
            ${sourHtml}
        `;

        const resBox = document.getElementById('resultBox');
        resBox.className = 'result-box success';
        resBox.innerHTML = html;

        document.getElementById('saveJournalBtn').onclick = () => {
            addToJournal({
                type: 'separation',
                input: { ...milk, creamFat, makeSourCream },
                results: { massCream, volCream, massSkim, volSkim }
            });
            alert('Расчёт сохранён в журнал!');
        };
        document.getElementById('saveJournalBtn').style.display = 'inline-block';
    });
}

// --- Логика страницы COTTAGE CHEESE ---
function initCottageCheese() {
    const milk = checkMilkDataRedirect();
    if (!milk) return;

    const targetCurdFatSelect = document.getElementById('targetCurdFatSelect');
    const customCurdFatInput = document.getElementById('customCurdFatInput');

    targetCurdFatSelect.addEventListener('change', () => {
        if (targetCurdFatSelect.value === 'custom') {
            customCurdFatInput.classList.remove('hidden');
        } else {
            customCurdFatInput.classList.add('hidden');
        }
    });

    document.getElementById('calcBtn').addEventListener('click', () => {
        let targetFat = parseFloat(targetCurdFatSelect.value);
        if (targetCurdFatSelect.value === 'custom') {
            targetFat = parseFloat(customCurdFatInput.value);
        }
        
        const moisture = parseFloat(document.getElementById('moisture').value) || CONFIG.moistureSkimmedCurd;
        const creamFat = CONFIG.fat.creamDefault;
        const creamDen = CONFIG.densities.cream;
        const skimDen = CONFIG.densities.skimmedMilk;
        const svSkim = CONFIG.dryMatterSkimmedMilk;
        const fatSkimCurd = CONFIG.fatSkimmedCurd;

        // 1. Сепарирование
        const massMilk = litersToKg(milk.volume, milk.density);
        const fatSkimRaw = CONFIG.fat.skimmedMilk;
        const massCreamTotal = massMilk * (milk.fat - fatSkimRaw) / (creamFat - fatSkimRaw);
        const massSkimTotal = massMilk - massCreamTotal;

        // 2. Творог обезжиренный
        // M_tv_ob = M_ob * (SV_ob / 100) / ((100 - Wl) / 100)
        const massSkimCurd = massSkimTotal * (svSkim / 100) / ((100 - moisture) / 100);

        // 3. Добавка сливок для жирности
        // M_sl_dob = M_tv_ob * (J_tv - J_tv_ob) / (J_sl - J_tv)
        if (targetFat <= fatSkimCurd) {
             const resBox = document.getElementById('resultBox');
             resBox.className = 'result-box error';
             resBox.innerHTML = 'Целевая жирность творога должна быть выше жирности обезжиренного творога (~0.2%).';
             return;
        }
        
        const massCreamAdd = massSkimCurd * (targetFat - fatSkimCurd) / (creamFat - targetFat);
        const volCreamAdd = kgToLiters(massCreamAdd, creamDen);
        const totalCurdMass = massSkimCurd + massCreamAdd;

        const html = `
            <h3>Результаты (Творог ${targetFat}%)</h3>
            <p>Из полученного обрата выйдет обезжиренного творога: <strong>${formatNum(massSkimCurd)} кг</strong>.</p>
            <p class="highlight">Необходимо добавить сливок: <strong>${formatNum(volCreamAdd)} л</strong> (${formatNum(massCreamAdd)} кг).</p>
            <p>Итоговая масса творога: <strong>${formatNum(totalCurdMass)} кг</strong>.</p>
            <p><small>Примечание: Расчёт предполагает использование всего обрата от сепарирования данного объёма молока.</small></p>
        `;

        const resBox = document.getElementById('resultBox');
        resBox.className = 'result-box success';
        resBox.innerHTML = html;

        document.getElementById('saveJournalBtn').onclick = () => {
            addToJournal({
                type: 'cottagecheese',
                input: { ...milk, targetFat, moisture },
                results: { totalCurdMass, creamAdd: volCreamAdd }
            });
            alert('Расчёт сохранён в журнал!');
        };
        document.getElementById('saveJournalBtn').style.display = 'inline-block';
    });
}

// --- Логика страницы CHEESE ---
function initCheese() {
    const milk = checkMilkDataRedirect();
    if (!milk) return;
    if (!milk.protein) {
        alert('Для расчёта сыра необходимо указать содержание белка на главной странице!');
        window.location.href = 'index.html';
        return;
    }

    // Интерполяция коэффициента K
    function getK(fatInDM) {
        if (fatInDM <= 45) return 1.98;
        if (fatInDM >= 50) return 2.16;
        // Линейная интерполяция
        const k1 = 1.98, f1 = 45;
        const k2 = 2.16, f2 = 50;
        return k1 + (k2 - k1) * (fatInDM - f1) / (f2 - f1);
    }

    document.getElementById('calcBtn').addEventListener('click', () => {
        const targetFatDM = parseFloat(document.getElementById('targetFatDM').value) || 45;
        const lossCheese = parseFloat(document.getElementById('lossCheese').value) || 0;
        
        // Дозировки
        const doseStarter = parseFloat(document.getElementById('doseStarter').value) || 0.2; // g/L
        const doseEnzyme = parseFloat(document.getElementById('doseEnzyme').value) || 0.4; // ml/L
        const doseCa = parseFloat(document.getElementById('doseCa').value) || 0.3; // g/L

        const K = getK(targetFatDM);
        const protein = milk.protein;
        
        // Требуемая жирность нормализованного молока: Ж_нм = К × Б × Ж_св / 100
        // Ж_св - желаемая массовая доля жира в сухом веществе (targetFatDM)
        const targetMilkFat = (K * protein * targetFatDM) / 100;

        const resBox = document.getElementById('resultBox');
        
        if (targetMilkFat <= 0) {
            resBox.className = 'result-box error';
            resBox.innerHTML = 'Ошибка расчёта требуемой жирности молока. Проверьте содержание белка.';
            return;
        }

        // Расчет нормализации (аналогично milk.html)
        const massMilk = litersToKg(milk.volume, milk.density);
        let addName, addFat, addDen;
        
        if (targetMilkFat < milk.fat) {
            addName = 'обрата';
            addFat = CONFIG.fat.skimmedMilk;
            addDen = CONFIG.densities.skimmedMilk;
        } else if (targetMilkFat > milk.fat) {
            addName = 'сливок (20%)';
            addFat = CONFIG.fat.creamDefault;
            addDen = CONFIG.densities.cream;
        } else {
            addName = 'нет (жирность совпадает)';
            addFat = 0; addDen = 0;
        }

        let volAdd = 0, massAdd = 0, totalVolNorm = milk.volume;

        if (addFat !== 0) {
            massAdd = massMilk * (milk.fat - targetMilkFat) / (targetMilkFat - addFat);
            volAdd = kgToLiters(massAdd, addDen);
            totalVolNorm = milk.volume + volAdd;
        }

        // Дозировки
        const massStarter = totalVolNorm * doseStarter;
        const volEnzyme = totalVolNorm * doseEnzyme;
        const massCa = totalVolNorm * doseCa;

        // Перевод в ложки
        const starterTsp = massStarter / CONFIG.spoons.tspGram;
        const starterTbsp = massStarter / CONFIG.spoons.tbspGram;
        
        const enzymeTsp = volEnzyme / CONFIG.spoons.tspMl;
        const enzymeTbsp = volEnzyme / CONFIG.spoons.tbspMl;

        const caTsp = massCa / CONFIG.spoons.tspGram;
        const caTbsp = massCa / CONFIG.spoons.tbspGram;

        let normText = addFat !== 0 
            ? `Добавьте <strong>${formatNum(volAdd)} л</strong> ${addName} для получения жирности смеси ${formatNum(targetMilkFat, 2)}%.`
            : `Жирность молока соответствует требуемой (${formatNum(targetMilkFat, 2)}%). Добавки не нужны.`;

        const html = `
            <h3>1. Нормализация под сыр</h3>
            <p>Требуемая жирность молока: <strong>${formatNum(targetMilkFat, 2)}%</strong> (Коэф. K=${formatNum(K, 2)})</p>
            <p>${normText}</p>
            <p>Объём нормализованной смеси: <strong>${formatNum(totalVolNorm)} л</strong></p>
            
            <h3>2. Дозировка ингредиентов</h3>
            <div class="table-responsive">
                <table>
                    <tr><th>Ингредиент</th><th>Грамм/мл</th><th>Чайные ложки</th><th>Столовые ложки</th></tr>
                    <tr><td>Закваска</td><td>${formatNum(massStarter)} г</td><td>~${formatNum(starterTsp, 1)}</td><td>~${formatNum(starterTbsp, 1)}</td></tr>
                    <tr><td>Фермент</td><td>${formatNum(volEnzyme)} мл</td><td>~${formatNum(enzymeTsp, 1)}</td><td>~${formatNum(enzymeTbsp, 1)}</td></tr>
                    <tr><td>CaCl₂</td><td>${formatNum(massCa)} г</td><td>~${formatNum(caTsp, 1)}</td><td>~${formatNum(caTbsp, 1)}</td></tr>
                </table>
            </div>

            <h3>3. После созревания (Расчёт факта)</h3>
            <div class="form-group" style="background:#fff; padding:10px; border:1px solid #eee; margin-top:10px;">
                <label>Фактическая масса сыра (кг):</label>
                <input type="number" id="factMass" placeholder="Например, 10.5">
                <label>Жирность сыра (%):</label>
                <input type="number" id="factFat" placeholder="Например, 20">
                <label>Влажность сыра (%):</label>
                <input type="number" id="factMoisture" placeholder="Например, 45">
                <button type="button" class="btn" onclick="calcCheeseFact()">Рассчитать показатели</button>
                <div id="factResult" style="margin-top:10px; font-weight:bold;"></div>
            </div>
        `;

        resBox.className = 'result-box success';
        resBox.innerHTML = html;

        // Глобальная функция для внутреннего расчёта факта
        window.calcCheeseFact = function() {
            const m = parseFloat(document.getElementById('factMass').value);
            const f = parseFloat(document.getElementById('factFat').value);
            const w = parseFloat(document.getElementById('factMoisture').value);
            
            if (!m || !f || !w) {
                document.getElementById('factResult').innerHTML = '<span style="color:red">Заполните все поля</span>';
                return;
            }

            const factFatDM = (f * 100) / (100 - w);
            const yieldPercent = (m / (litersToKg(totalVolNorm, CONFIG.densities.milk))) * 100; // Грубо, лучше на массу смеси

            document.getElementById('factResult').innerHTML = 
                `Фактический МДЖСВ: <span style="color:#2c3e50">${formatNum(factFatDM, 1)}%</span><br>` +
                `Выход сыра от смеси: <span style="color:#2c3e50">${formatNum(yieldPercent, 1)}%</span>`;
        };

        document.getElementById('saveJournalBtn').onclick = () => {
            addToJournal({
                type: 'cheese',
                input: { ...milk, targetFatDM, doseStarter, doseEnzyme, doseCa },
                results: { targetMilkFat, totalVolNorm }
            });
            alert('Расчёт сохранён в журнал!');
        };
        document.getElementById('saveJournalBtn').style.display = 'inline-block';
    });
}

// --- Логика страницы JOURNAL ---
function initJournal() {
    renderJournal();
    document.getElementById('clearBtn').addEventListener('click', clearJournal);
}

function renderJournal() {
    const list = document.getElementById('journalList');
    const data = getJournal();
    list.innerHTML = '';

    if (data.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#777;">Журнал пуст.</p>';
        return;
    }

    data.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'journal-entry';
        
        let typeName = '';
        switch(entry.type) {
            case 'milk': typeName = 'Питьевое молоко'; break;
            case 'separation': typeName = 'Сепарирование'; break;
            case 'cottagecheese': typeName = 'Творог'; break;
            case 'cheese': typeName = 'Сыр'; break;
            default: typeName = entry.type;
        }

        div.innerHTML = `
            <div class="journal-date">${entry.dateStr}</div>
            <div class="journal-type">${typeName}</div>
            <div class="journal-details hidden">
                <p><strong>Входные данные:</strong> ${JSON.stringify(entry.input).replace(/[{"}]/g, '').substring(0, 100)}...</p>
                <p><strong>Результат:</strong> ${entry.results.html ? 'См. подробный расчёт' : JSON.stringify(entry.results).replace(/[{"}]/g, '').substring(0, 100)}...</p>
            </div>
        `;

        div.addEventListener('click', () => {
            const details = div.querySelector('.journal-details');
            details.classList.toggle('hidden');
        });

        list.appendChild(div);
    });
}