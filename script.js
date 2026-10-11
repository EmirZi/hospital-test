(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {
    test: null, questions: [], answers: [], index: 0, startedAt: 0,
    timerId: null, remaining: 0, finished: false, participant: '', directLink: false
  };
  const themes = ['surgery','vaccination','admin','emergency','training','dark','default'];

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function fail(message) { console.error('[Проверка тестов] ' + message); }
  function validateTests() {
    const tests = window.TESTS;
    if (!Array.isArray(tests) || !tests.length) {
      fail('window.TESTS должен содержать хотя бы один тест.');
      return [];
    }
    const ids = new Set(), questionIds = new Set(), valid = [];
    tests.forEach((test, ti) => {
      const label = `Тест "${test?.title || test?.id || ti + 1}"`;
      const errors = [];
      if (!test || typeof test !== 'object') { fail(`Элемент ${ti + 1} не является объектом.`); return; }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(test.id || '')) errors.push('ID теста должен содержать только латинские буквы, цифры и дефисы');
      if (ids.has(test.id)) errors.push(`повторяется ID теста "${test.id}"`);
      ids.add(test.id);
      if (!test.title || typeof test.title !== 'string') errors.push('не указано название');
      if (!Array.isArray(test.questions) || !test.questions.length) errors.push('нет вопросов');
      if (!Number.isFinite(Number(test.passPercent)) || Number(test.passPercent) < 0 || Number(test.passPercent) > 100) errors.push('passPercent должен быть от 0 до 100');
      if (!Number.isFinite(Number(test.timeLimit)) || Number(test.timeLimit) < 0) errors.push('timeLimit должен быть 0 или положительным числом');
      if (test.theme && !themes.includes(test.theme)) errors.push(`неизвестная тема "${test.theme}"`);
      (Array.isArray(test.questions) ? test.questions : []).forEach((q, qi) => {
        const qlabel = `вопрос ${qi + 1}${q?.id ? ` (ID "${q.id}")` : ''}`;
        const qe = [];
        if (!q || typeof q !== 'object') { errors.push(`${qlabel}: некорректный объект`); return; }
        if (!q.id || typeof q.id !== 'string') qe.push('нет ID');
        const globalQid = `${test.id}:${q.id}`;
        if (questionIds.has(globalQid)) qe.push('дублирующийся ID вопроса в тесте');
        questionIds.add(globalQid);
        if (!q.question || typeof q.question !== 'string' || !q.question.trim()) qe.push('пустой текст');
        if (!['single','multiple'].includes(q.type)) qe.push('type должен быть single или multiple');
        if (!Array.isArray(q.answers) || q.answers.length < 2 || q.answers.some(a => typeof a !== 'string' || !a.trim())) qe.push('нужно минимум 2 непустых варианта ответа');
        if (!Array.isArray(q.correct) || !q.correct.length) qe.push('нет правильных ответов');
        else {
          if (new Set(q.correct).size !== q.correct.length) qe.push('повторяются индексы правильных ответов');
          if (q.correct.some(i => !Number.isInteger(i) || i < 0 || !Array.isArray(q.answers) || i >= q.answers.length)) qe.push('индекс правильного ответа вне диапазона');
          if (q.type === 'single' && q.correct.length !== 1) qe.push('для single нужен ровно один правильный ответ');
        }
        if (q.points !== undefined && (!Number.isFinite(Number(q.points)) || Number(q.points) <= 0)) qe.push('points должен быть конечным числом больше нуля');
        if (qe.length) errors.push(`${qlabel}: ${qe.join('; ')}`);
      });
      if (errors.length) fail(`${label}: ${errors.join(' | ')}`);
      else valid.push(test);
    });
    return valid;
  }
  let allTests = [];

  function configTheme(test) {
    if (themes.includes(test.theme)) return test.theme;
    const text = `${test.title} ${test.description || ''}`.toLowerCase();
    if (/вакцин|привив|иммун/.test(text)) return 'vaccination';
    if (/администрац|\bаб\b|управлен|регламент/.test(text)) return 'admin';
    if (/экстрен|скорая|реанима|неотлож|ems/.test(text)) return 'emergency';
    if (/обучен|квалифика|экзамен|учеб/.test(text)) return 'training';
    if (/хирург|операц/.test(text)) return 'surgery';
    return 'default';
  }
  function applyTheme(test) {
    document.body.classList.remove(...themes.map(t => `theme-${t}`), 'test-changing');
    document.body.classList.add(`theme-${configTheme(test)}`);
    const logo = $('logo');
    if (logo) logo.textContent = ({surgery:'SURG',vaccination:'VAX',admin:'АБ',emergency:'EMS',training:'EDU',dark:'TEST',default:'TEST'})[configTheme(test)];
  }
  function showScreen(id) {
    ['start-screen','test-screen','result-screen'].forEach(s => $(s).classList.toggle('hidden', s !== id));
  }
  function updateStart(test) {
    $('test-title').textContent = test ? test.title : 'Онлайн-тестирование';
    $('test-description').textContent = test ? (test.description || 'Проверьте свои знания.') : 'Выберите тест и проверьте свои знания.';
    $('question-count').textContent = test ? `${test.questions.length} вопросов` : `${allTests.length} теста доступно`;
    $('pass-info').textContent = test ? `Проходной балл: ${test.passPercent}%` : 'Выберите интересующую тему';
    $('time-info').textContent = test ? (Number(test.timeLimit) > 0 ? `Время: ${test.timeLimit} мин.` : 'Без ограничения времени') : 'Мгновенная проверка результата';
    $('start-btn').textContent = test ? 'Начать тест →' : 'Выберите тест ниже';
    $('start-btn').disabled = !test;
    $('catalog-heading').classList.toggle('hidden', state.directLink);
    $('test-catalog').classList.toggle('hidden', state.directLink);
    if (test) applyTheme(test);
    else document.body.classList.remove(...themes.map(t => `theme-${t}`));
  }
  function renderCatalog() {
    const box = $('test-catalog');
    box.replaceChildren();
    allTests.forEach((test, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'test-option'; button.style.width = '100%'; button.style.textAlign = 'left';
      const icon = document.createElement('span'); icon.className = 'test-icon'; icon.textContent = ['✚','✓','⌗','✦'][i % 4];
      const details = document.createElement('div');
      const title = document.createElement('b'); title.textContent = test.title;
      const desc = document.createElement('small');
      desc.textContent = `${test.description || 'Проверьте свои знания'} · ${test.questions.length} вопросов · проходной балл ${test.passPercent}%`;
      const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '›';
      details.append(title, desc); button.append(icon, details, arrow);
      button.addEventListener('click', () => {
        state.directLink = true; selectTest(test.id, true);
        history.pushState({}, '', urlForTest(test.id));
      });
      box.append(button);
    });
  }
  function urlForTest(id) {
    const url = new URL(window.location.href);
    url.search = ''; url.hash = '';
    url.searchParams.set('test', id);
    return url.href;
  }
  function selectTest(id, direct) {
    const test = allTests.find(t => t.id === id);
    if (!test) {
      state.test = null; state.directLink = true; showScreen('start-screen');
      $('test-title').textContent = 'Тест не найден';
      $('test-description').textContent = `Тест с ID «${id}» не существует. Проверьте ссылку или вернитесь в каталог.`;
      $('question-count').textContent = ''; $('time-info').textContent = ''; $('pass-info').textContent = '';
      $('start-btn').disabled = true; $('start-btn').textContent = 'Тест недоступен';
      $('catalog-heading').classList.remove('hidden'); $('test-catalog').classList.remove('hidden');
      return;
    }
    state.test = test; state.directLink = !!direct;
    $('participant-name').value = '';
    updateStart(test); showScreen('start-screen');
  }
  function prepareQuestions() {
    const source = state.test.questions.map(q => ({
      ...q, answers: q.answers.slice(), correct: q.correct.slice(),
      points: Number(q.points === undefined ? 1 : q.points)
    }));
    const arranged = state.test.shuffleQuestions ? shuffle(source) : source;
    state.questions = arranged.map(q => {
      if (!state.test.shuffleAnswers) return q;
      const indexed = q.answers.map((answer, index) => ({answer,index}));
      const mixed = shuffle(indexed);
      return {...q, answers:mixed.map(x=>x.answer),
        correct:mixed.map((x,i)=>q.correct.includes(x.index)?i:-1).filter(i=>i>=0)};
    });
    state.answers = state.questions.map(() => []);
  }
  function startTest() {
    if (state.finished || !state.test) return;
    const name = $('participant-name').value.trim();
    if (!name) { alert('Введите имя и фамилию.'); $('participant-name').focus(); return; }
    state.participant = name;
    const liveNameInput = $('participant-name-live');
    if (liveNameInput) liveNameInput.value = name;
    const participantDisplay = $('participant-display');
    if (participantDisplay) participantDisplay.textContent = name;
    prepareQuestions();
    state.index = 0; state.finished = false; state.startedAt = Date.now();
    clearInterval(state.timerId); state.timerId = null;
    showScreen('test-screen');
    const seconds = Math.floor(Number(state.test.timeLimit) * 60);
    if (seconds > 0) {
      state.remaining = seconds; updateTimer();
      state.timerId = setInterval(() => {
        if (state.finished) return;
        state.remaining = Math.max(0, state.remaining - 1); updateTimer();
        if (state.remaining === 0) finishTest(true);
      }, 1000);
    } else { $('timer').textContent = 'Без таймера'; $('timer').classList.remove('timer-warning'); }
    renderQuestion();
  }
  function updateTimer() {
    const m = Math.floor(state.remaining / 60), s = state.remaining % 60;
    $('timer').textContent = `Время: ${m}:${String(s).padStart(2,'0')}`;
    $('timer').classList.toggle('timer-warning', state.remaining <= 60);
  }
  function renderQuestion() {
    const q = state.questions[state.index];
    if (!q) return;
    const selected = state.answers[state.index];
    $('progress').textContent = `Вопрос ${state.index + 1} из ${state.questions.length}`;
    $('progress-bar').style.width = `${((state.index + 1) / state.questions.length) * 100}%`;
    $('question').textContent = q.question;
    $('hint').textContent = q.type === 'multiple' ? 'Выберите все правильные варианты.' : 'Выберите один вариант.';
    const box = $('answers'); box.replaceChildren();
    q.answers.forEach((answer, i) => {
      const button = document.createElement('button'); button.type='button'; button.className='answer';
      const input = document.createElement('input'); input.type=q.type==='multiple'?'checkbox':'radio';
      input.checked=selected.includes(i); input.tabIndex=-1; input.setAttribute('aria-label',answer);
      const span=document.createElement('span'); span.textContent=answer;
      if(input.checked) button.classList.add('selected');
      button.append(input,span);
      button.addEventListener('click', () => {
        if (state.finished) return;
        if (q.type === 'multiple') {
          state.answers[state.index] = selected.includes(i) ? selected.filter(v=>v!==i) : [...selected,i];
        } else state.answers[state.index] = [i];
        renderQuestion();
      });
      box.append(button);
    });
    $('next-btn').disabled = false;
    $('next-btn').textContent = state.index === state.questions.length - 1 ? 'Завершить тест' : 'Далее →';
  }
  function finishTest(expired = false) {
    if (state.finished) return;
    state.finished = true; clearInterval(state.timerId); state.timerId = null;
    let score = 0, maxScore = 0, correctCount = 0;
    state.questions.forEach((q,i) => {
      const points = Number(q.points);
      maxScore += points;
      const picked = [...(state.answers[i] || [])].sort((a,b)=>a-b);
      const key = [...q.correct].sort((a,b)=>a-b);
      if (picked.length === key.length && picked.every((v,j)=>v===key[j])) { score += points; correctCount++; }
    });
    score = Math.min(score,maxScore);
    const percent = maxScore > 0 ? score / maxScore * 100 : 0;
    const passPercent = Number(state.test.passPercent);
    const passed = maxScore > 0 && percent >= passPercent;
    const elapsed = Math.max(0,Math.floor((Date.now()-state.startedAt)/1000));
    const date = new Date();
    showScreen('result-screen');
    $('result-test-title').textContent = state.test.title;
    $('result-number').textContent = passed ? nextResultNumber() : '—';
    $('result-date').textContent = date.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    $('result-time').textContent = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
    $('result-name').textContent = state.participant;
    $('result-name-top').textContent = state.participant;
    $('gauge-value').textContent = `${Math.round(percent)}%`;
    $('gauge').style.setProperty('--percent',Math.max(0,Math.min(100,percent)));
    $('correct-value').textContent = `${score} баллов`;
    $('max-value').textContent = `${maxScore} баллов`;
    $('percent-value').textContent = `${percent.toFixed(2).replace('.',',')}%`;
    $('status-value').textContent = passed ? 'Тест пройден' : 'Тест не пройден';
    $('status-value').classList.remove('status-pass','status-fail');
    $('status-value').classList.add(passed?'status-pass':'status-fail');
    $('result-status-title').textContent = passed?'Тест пройден':'Тест не пройден';
    $('result-medal').textContent = passed?'✓':'×'; $('result-medal').classList.toggle('fail',!passed);
    $('result-note').textContent = expired ? 'Время теста закончилось. Результат рассчитан по сохранённым ответам.' :
      (passed ? 'Поздравляем! Вы успешно прошли тест.' : `Для прохождения нужно набрать минимум ${passPercent}%.`);
    applyTheme(state.test);
  }
  function nextResultNumber() {
    try {
      const key = `onlineTestPassedCounter:${state.test.id}`;
      const next = Number(localStorage.getItem(key) || '0') + 1;
      localStorage.setItem(key,String(next));
      return String(next).padStart(4,'0');
    } catch (_) { return '0001'; }
  }
  function goHome() {
    clearInterval(state.timerId); state.timerId=null; state.finished=false;
    state.test=null; state.directLink=false;
    history.pushState({},'',window.location.pathname);
    updateStart(null); showScreen('start-screen');
  }
  const liveNameInput = $('participant-name-live');
  if (liveNameInput) {
    liveNameInput.addEventListener('input', () => {
      const name = liveNameInput.value.trim();
      state.participant = name;
      const resultName = $('result-name');
      const resultNameTop = $('result-name-top');
      if (resultName) resultName.textContent = name || '—';
      if (resultNameTop) resultNameTop.textContent = name || '—';
      const startName = $('participant-name');
      if (startName) startName.value = liveNameInput.value;
    });
  }

  $('start-btn').addEventListener('click',startTest);
  $('next-btn').addEventListener('click',() => {
    if (state.finished) return;
    if (state.index < state.questions.length - 1) { state.index++; renderQuestion(); }
    else finishTest(false);
  });
  window.addEventListener('popstate',() => {
    const id = new URLSearchParams(location.search).get('test');
    if (id) selectTest(id,true);
    else { state.test=null; state.directLink=false; updateStart(null); showScreen('start-screen'); }
  });

  allTests = validateTests();
  renderCatalog();
  const requested = new URLSearchParams(window.location.search).get('test');
  if (requested) selectTest(requested,true);
  else { state.directLink=false; updateStart(null); showScreen('start-screen'); }
})();
