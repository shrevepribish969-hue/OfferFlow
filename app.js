// OfferFlow - SaaS Core Application Logic (Upgraded with Vertical Kanban & Custom Stages)

// ==========================================
// 1. Core State & Data Models
// ==========================================

let jobs = [];
let companies = [];
let tasks = [];
let calendarEvents = [];

// 💡 提示：用户可以在此处直接硬编码内置您的 API Key。一经修改，启动时将自动载入。
let settings = {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '', // 👈 请在此处填入您的 API Key，或在网页端「Settings」配置中填入，数据将安全保存在浏览器本地（LocalStorage）中。
    modelName: 'deepseek-chat',
    warningDays: 5,
    enableNotif: false,
    resumeText: '', // 个人简历
    stages: ['准备中', '已投递', '测评中', '笔试中', '面试中', '终面', '已斩获Offer', '被拒/归档'] // 看板默认垂直阶段流程
};

let globalChatHistory = [];
let drawerChatHistory = [];

// Navigation state
let currentView = 'dashboard';
let currentCompanyId = null;

// Global Filter states
let searchFilterQuery = '';
let boardStaleOnly = false;

// DOM Elements
const kanbanWrapper = document.getElementById('kanban-vertical-wrapper');
const searchInput = document.getElementById('global-search');

// ==========================================
// 2. Data Initialization & Storage Helpers
// ==========================================
function loadAllData() {
    try {
        const storedSettings = localStorage.getItem('offerflow_settings');
        if (storedSettings) {
            settings = { ...settings, ...JSON.parse(storedSettings) };
        } else {
            // If settings don't exist yet, save the default settings object (which might have hardcoded apiKey)
            saveAllData();
        }

        const storedJobs = localStorage.getItem('offerflow_jobs');
        if (storedJobs) jobs = JSON.parse(storedJobs);

        const storedCompanies = localStorage.getItem('offerflow_companies');
        if (storedCompanies) companies = JSON.parse(storedCompanies);

        const storedTasks = localStorage.getItem('offerflow_tasks');
        if (storedTasks) tasks = JSON.parse(storedTasks);

        const storedEvents = localStorage.getItem('offerflow_events');
        if (storedEvents) calendarEvents = JSON.parse(storedEvents);

        const storedGlobalChat = localStorage.getItem('offerflow_global_chat');
        if (storedGlobalChat) globalChatHistory = JSON.parse(storedGlobalChat);

        // Prepopulate demo data on first load
        if (jobs.length === 0 && companies.length === 0) {
            prepopulateDemoData();
        }
    } catch (e) {
        console.error('Failed to load local storage:', e);
    }
}

function saveAllData() {
    try {
        localStorage.setItem('offerflow_jobs', JSON.stringify(jobs));
        localStorage.setItem('offerflow_companies', JSON.stringify(companies));
        localStorage.setItem('offerflow_tasks', JSON.stringify(tasks));
        localStorage.setItem('offerflow_events', JSON.stringify(calendarEvents));
        localStorage.setItem('offerflow_settings', JSON.stringify(settings));
        localStorage.setItem('offerflow_global_chat', JSON.stringify(globalChatHistory));
    } catch (e) {
        console.error('Failed to save local storage:', e);
    }
}

function prepopulateDemoData() {
    const mockCompanyId = 'comp_1';
    companies = [{
        id: mockCompanyId,
        name: '网易',
        intro: '网易公司成立于1997年，是中国领先的互联网技术公司，在开发互联网应用、服务及其他技术方面，始终保持中国业界领先地位。旗下网易邮箱智邮团队专注于企业通讯与AI智能化应用。',
        website: 'https://campus.163.com',
        hrContact: 'wangyi_hr@corp.netease.com',
        department: '网易智邮产品部',
        location: '北京',
        notes: '网易比较注重实习经历中的落地细节，以及对 AI Agent 流程编排和 Prompt 调试的敏感度。',
        createdAt: new Date().toISOString()
    }];

    jobs = [{
        id: 'job_1',
        companyId: mockCompanyId,
        company: '网易',
        position: '产品实习生',
        status: '已投递',
        location: '北京',
        url: 'https://campus.163.com',
        salary: '300/天',
        platform: '官网投递',
        resumeVersion: 'AI产品版v1',
        rating: '4',
        followUpDays: 5,
        jd: '1. 参与 AI 买家工具的产品迭代，编写 PRD 并跟进开发；2. 优化 AI 工具使用体验，提升效率；3. 参与 Skill, Prompt 设计与调优，编排 AI Agent。',
        notes: '复制了 JD，使用 AI 进行了解析与记录。默认 5 天跟进开启。',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days ago
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    }];

    tasks = [
        { id: 'task_1', text: '跟进网易投递状态', done: false, date: new Date().toISOString().split('T')[0], jobId: 'job_1' }
    ];

    calendarEvents = [
        { id: 'event_1', title: '网易 投递跟进提醒', type: 'followup', date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], jobId: 'job_1' }
    ];

    saveAllData();
}

// ==========================================
// 3. Tab Navigation Logic
// ==========================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.dataset.view;
            if (targetView) {
                switchTab(targetView);
            }
        });
    });

    // Default Tab
    switchTab('dashboard');
}

function switchTab(viewName) {
    currentView = viewName;

    // Toggle nav active style
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Toggle view containers
    document.querySelectorAll('.tab-content').forEach(view => {
        if (view.id === `view-${viewName}`) {
            view.classList.remove('hidden');
        } else {
            view.classList.add('hidden');
        }
    });

    // Refresh view specific data
    renderViewData(viewName);
}

function renderViewData(viewName) {
    // Populate select choices whenever viewing forms
    populateStageSelects();

    switch (viewName) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'applications':
            renderKanban();
            break;
        case 'companies':
            renderCompaniesList();
            break;
        case 'calendar':
            renderCalendar();
            break;
        case 'analytics':
            renderAnalytics();
            break;
        case 'ai-assistant':
            renderGlobalChat();
            break;
        case 'settings':
            renderSettings();
            break;
    }
}

// Populate select choices dynamically based on settings.stages
function populateStageSelects() {
    const selects = [
        document.getElementById('confirm-status'),
        document.getElementById('card-status'),
        document.getElementById('drawer-card-status')
    ];

    selects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '';
        settings.stages.forEach(st => {
            select.innerHTML += `<option value="${st}">${st}</option>`;
        });
        // Restore value if existed
        if (currentVal && settings.stages.includes(currentVal)) {
            select.value = currentVal;
        }
    });
}

// ==========================================
// 4. MODULE: Dashboard (主页概览与 SVG 霓虹趋势)
// ==========================================
function renderDashboard() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let countFollow = 0;
    let countInterview = 0;
    let countPlanned = 0;

    jobs.forEach(job => {
        if (job.status !== '被拒/归档' && job.date) {
            const limit = job.followUpDays || settings.warningDays || 5;
            const deadline = new Date(job.date).getTime() + (limit * 24 * 60 * 60 * 1000);
            if (now.getTime() > deadline) {
                countFollow++;
            }
            if (job.status.includes('面试') || job.status.includes('终面')) {
                countInterview++;
            }
        }
        if (job.status.includes('准备') || job.status.includes('意向')) {
            countPlanned++;
        }
    });

    document.getElementById('metric-today-follow').innerText = countFollow;
    document.getElementById('metric-today-interviews').innerText = countInterview;
    document.getElementById('metric-planned-apply').innerText = countPlanned;

    const taskCount = tasks.filter(t => !t.done && t.date === todayStr).length;
    document.getElementById('dashboard-subtitle').innerText = taskCount > 0
        ? `今天还有 ${taskCount} 件跟进任务需要完成。`
        : `今天的所有任务都搞定了！准备迎接新的面试吧。`;

    // Render stats
    let applyCountWeekly = 0;
    let interviewCountWeekly = 0;
    let offerCountWeekly = 0;
    let rejectCountWeekly = 0;

    const oneWeekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    jobs.forEach(job => {
        const updateTime = new Date(job.updatedAt || job.createdAt).getTime();
        if (updateTime >= oneWeekAgo) {
            if (job.status.includes('投递')) applyCountWeekly++;
            if (job.status.includes('面试') || job.status.includes('面')) interviewCountWeekly++;
            if (job.status.includes('Offer') || job.status.includes('录')) offerCountWeekly++;
            if (job.status.includes('拒') || job.status.includes('档') || job.status.includes('感谢信')) rejectCountWeekly++;
        }
    });

    document.getElementById('week-stat-apply').innerText = applyCountWeekly;
    document.getElementById('week-stat-interview').innerText = interviewCountWeekly;
    document.getElementById('week-stat-offer').innerText = offerCountWeekly;
    document.getElementById('week-stat-reject').innerText = rejectCountWeekly;

    renderTasksList();
    drawWeeklySVGChart();
}

function renderTasksList() {
    const container = document.getElementById('dashboard-tasks-container');
    container.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.date === todayStr);

    if (todayTasks.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-slate-400 py-12">
                <i class="fa-regular fa-calendar-check text-3xl mb-2 text-slate-300"></i>
                <p class="text-xs">今天没有待办任务，可以双击日历或点击右上方新建！</p>
            </div>
        `;
        return;
    }

    const sortedTasks = [...todayTasks].sort((a, b) => a.done - b.done);

    sortedTasks.forEach(task => {
        const taskDiv = document.createElement('div');
        taskDiv.className = `flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/40 rounded-xl hover:bg-slate-100/50 transition ${task.done ? 'opacity-50' : ''}`;

        taskDiv.innerHTML = `
            <div class="flex items-center gap-3">
                <input type="checkbox" ${task.done ? 'checked' : ''} class="task-checkbox rounded border-slate-300 text-brand-500 focus:ring-brand-500 h-4.5 w-4.5 cursor-pointer">
                <span class="text-xs font-semibold text-slate-700 ${task.done ? 'line-through text-slate-400' : ''}">${task.text}</span>
            </div>
            <button class="btn-delete-task text-slate-400 hover:text-rose-500 transition p-1">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        `;

        taskDiv.querySelector('.task-checkbox').addEventListener('change', (e) => {
            task.done = e.target.checked;
            saveAllData();
            renderDashboard();
        });

        taskDiv.querySelector('.btn-delete-task').addEventListener('click', () => {
            if (confirm('确认删除任务？')) {
                tasks = tasks.filter(t => t.id !== task.id);
                saveAllData();
                renderDashboard();
            }
        });

        container.appendChild(taskDiv);
    });
}

function drawWeeklySVGChart() {
    const chartContainer = document.getElementById('weekly-svg-chart-container');
    chartContainer.innerHTML = '';

    const dates = [];
    const counts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        dates.push(dStr);
        counts.push(jobs.filter(j => j.date === dStr).length);
    }

    const maxCount = Math.max(...counts, 3);

    let svgPoints = '';
    let areaPoints = '10,110 ';

    counts.forEach((c, idx) => {
        const x = (idx / 6) * 260 + 20;
        const y = 110 - (c / maxCount) * 80;
        svgPoints += `${x},${y} `;
        areaPoints += `${x},${y} `;
    });
    areaPoints += `280,110`;

    let weekdayLabels = '';
    dates.forEach((dStr, idx) => {
        const x = (idx / 6) * 260 + 20;
        const dateObj = new Date(dStr);
        const label = dateObj.toLocaleDateString('zh-CN', { weekday: 'narrow' });
        weekdayLabels += `<text x="${x}" y="125" text-anchor="middle" font-size="9" fill="#94A3B8" font-weight="500">${label}</text>`;
    });

    const svgHtml = `
        <svg width="100%" height="100%" viewBox="0 0 300 135" xmlns="http://www.w3.org/2000/svg" class="overflow-visible">
            <defs>
                <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#4F7CFF" flood-opacity="0.4"/>
                </filter>
                <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#4F7CFF" stop-opacity="0.15" />
                    <stop offset="100%" stop-color="#4F7CFF" stop-opacity="0.0" />
                </linearGradient>
            </defs>
            
            <line x1="10" y1="30" x2="290" y2="30" stroke="#E2E8F0" stroke-width="0.75" stroke-dasharray="3,3" />
            <line x1="10" y1="70" x2="290" y2="70" stroke="#E2E8F0" stroke-width="0.75" stroke-dasharray="3,3" />
            <line x1="10" y1="110" x2="290" y2="110" stroke="#CBD5E1" stroke-width="1" />
            
            <polygon points="${areaPoints}" fill="url(#chart-area-grad)" />
            <polyline points="${svgPoints.trim()}" fill="none" stroke="#4F7CFF" stroke-width="2.5" filter="url(#neon-glow)" stroke-linecap="round" stroke-linejoin="round" />
            
            ${counts.map((c, idx) => {
        const x = (idx / 6) * 260 + 20;
        const y = 110 - (c / maxCount) * 80;
        return `
                    <circle cx="${x}" cy="${y}" r="3.5" fill="#FFFFFF" stroke="#4F7CFF" stroke-width="2.5" class="transition-all duration-300 cursor-pointer" />
                    ${c > 0 ? `<text x="${x}" y="${y - 8}" text-anchor="middle" font-size="8" fill="#4F7CFF" font-weight="bold">${c}</text>` : ''}
                `;
    }).join('')}
            ${weekdayLabels}
        </svg>
    `;
    chartContainer.innerHTML = svgHtml;
}

document.getElementById('btn-add-task-quick').addEventListener('click', () => {
    document.getElementById('form-custom-event').reset();
    document.getElementById('event-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('event-type').value = 'followup';

    const select = document.getElementById('event-job-id');
    select.innerHTML = '<option value="">-- 不关联任何岗位 --</option>';
    jobs.forEach(j => {
        select.innerHTML += `<option value="${j.id}">${j.company} - ${j.position}</option>`;
    });
    openModal('modal-custom-event');
});

// ==========================================
// 5. MODULE: Applications Kanban (竖向流程看板)
// ==========================================
function renderKanban() {
    kanbanWrapper.innerHTML = '';
    const now = new Date();

    // 1. Filtering logic
    let filtered = [...jobs];
    if (searchFilterQuery.trim()) {
        const q = searchFilterQuery.toLowerCase().trim();
        filtered = filtered.filter(j =>
            j.company.toLowerCase().includes(q) ||
            j.position.toLowerCase().includes(q) ||
            (j.location && j.location.toLowerCase().includes(q)) ||
            (j.notes && j.notes.toLowerCase().includes(q))
        );
    }
    if (boardStaleOnly) {
        filtered = filtered.filter(j => {
            if (j.status.includes('被拒') || j.status.includes('归档') || j.status.includes('结束')) return false;
            if (!j.date) return false;
            const limit = j.followUpDays || settings.warningDays || 5;
            const deadline = new Date(j.date).getTime() + (limit * 24 * 60 * 60 * 1000);
            return now.getTime() > deadline;
        });
    }

    // 2. Loop stages dynamically
    settings.stages.forEach((stageName, index) => {
        const stageJobs = filtered.filter(j => j.status === stageName);

        // Color mapping for circles
        const colors = ['bg-slate-400', 'bg-blue-400', 'bg-purple-400', 'bg-amber-400', 'bg-indigo-500', 'bg-cyan-400', 'bg-emerald-500', 'bg-rose-500'];
        const bulletColor = colors[index % colors.length];

        // Create stage row
        const row = document.createElement('div');
        row.className = 'bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center transition duration-200';

        row.innerHTML = `
            <!-- Left Header -->
            <div class="w-full md:w-48 shrink-0 flex items-center justify-between border-b md:border-b-0 md:border-r border-slate-100 pb-2.5 md:pb-0 md:pr-4">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full ${bulletColor} shadow-md"></span>
                    <span class="font-bold text-slate-800 text-xs tracking-wider">${stageName}</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <span class="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-bold">${stageJobs.length}</span>
                    <button class="btn-delete-stage text-slate-300 hover:text-rose-500 transition p-1" data-stage="${stageName}" title="删除此阶段">
                        <i class="fa-solid fa-trash-can text-[10px]"></i>
                    </button>
                </div>
            </div>
            
            <!-- Right Horizontal Cards container -->
            <div class="kanban-dropzone flex-1 overflow-x-auto flex gap-4 py-1 pr-2 w-full select-none" data-status="${stageName}" style="min-height: 80px;">
                <!-- Cards will render here -->
            </div>
        `;

        const dropzone = row.querySelector('.kanban-dropzone');

        if (stageJobs.length === 0) {
            dropzone.innerHTML = `<div class="text-[10px] text-slate-300 self-center py-6 pointer-events-none">拖拽岗位卡片至此以更新状态</div>`;
        } else {
            stageJobs.forEach(job => {
                let isStale = false;
                let timelineBar = '';

                if (job.status !== '被拒/归档' && job.date) {
                    const limit = job.followUpDays || settings.warningDays || 5;
                    const followUpDeadline = new Date(job.date).getTime() + (limit * 24 * 60 * 60 * 1000);
                    const timeLeft = followUpDeadline - now.getTime();
                    const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));

                    let colorBar = 'bg-brand-500';
                    let textColor = 'text-brand-500';
                    let labelText = `剩 ${daysLeft} 天跟进`;

                    if (daysLeft < 0) {
                        colorBar = 'bg-rose-500 animate-pulse';
                        textColor = 'text-rose-500 font-bold';
                        labelText = `⚠️ 已超期 ${Math.abs(daysLeft)} 天`;
                        isStale = true;
                    } else if (daysLeft <= 2) {
                        colorBar = 'bg-amber-500';
                        textColor = 'text-amber-400 font-semibold';
                        labelText = `⏳ 剩 ${daysLeft} 天`;
                    }

                    const pct = Math.max(0, Math.min(100, (daysLeft / limit) * 100));
                    timelineBar = `
                        <div class="mt-2">
                            <div class="flex justify-between items-center text-[8px] ${textColor}">
                                <span>${labelText}</span>
                                <span class="text-slate-400">${limit}天</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-1 overflow-hidden mt-0.5">
                                <div class="${colorBar} h-1 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    `;
                }

                let starHtml = '';
                if (job.rating) {
                    const count = parseInt(job.rating) || 4;
                    starHtml = `<div class="flex text-[8px] text-amber-400 mt-1">${'<i class="fa-solid fa-star"></i>'.repeat(count)}</div>`;
                }

                // Card Box
                const card = document.createElement('div');
                card.className = `w-44 shrink-0 p-3 bg-slate-50 hover:bg-white rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group shadow-sm hover:shadow-md ${isStale ? 'border-rose-300 bg-rose-50/10' : 'border-slate-200/80 hover:border-slate-300'
                    }`;
                card.setAttribute('draggable', 'true');
                card.dataset.id = job.id;

                card.innerHTML = `
                    <div class="flex items-start justify-between gap-1 mb-1.5">
                        <span class="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[60px]">${job.platform || '手动'}</span>
                        ${job.location ? `<span class="text-[8px] font-bold text-slate-500 truncate max-w-[80px]"><i class="fa-solid fa-map-marker-alt"></i> ${job.location}</span>` : ''}
                    </div>
                    <h4 class="font-bold text-slate-900 group-hover:text-brand-500 transition text-[11px] truncate leading-tight">${job.company}</h4>
                    <p class="text-[10px] text-slate-500 font-medium truncate mt-0.5 leading-tight">${job.position}</p>
                    
                    ${starHtml}
                    ${timelineBar}
                    
                    ${job.url ? `
                        <div class="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition duration-150">
                            <a href="${job.url}" target="_blank" onclick="event.stopPropagation()" class="p-1 bg-white border border-slate-200 rounded text-brand-500 text-[9px]">🔗</a>
                        </div>
                    ` : ''}
                `;

                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', job.id);
                    card.classList.add('opacity-40');
                });
                card.addEventListener('dragend', () => card.classList.remove('opacity-40'));
                card.addEventListener('click', () => openJobDrawer(job.id));

                dropzone.appendChild(card);
            });
        }

        // Dragover events on dropzones
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('bg-slate-100/50');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('bg-slate-100/50');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('bg-slate-100/50');
            const jobId = e.dataTransfer.getData('text/plain');
            const targetStage = dropzone.dataset.status;

            const idx = jobs.findIndex(j => j.id === jobId);
            if (idx > -1 && jobs[idx].status !== targetStage) {
                jobs[idx].status = targetStage;
                jobs[idx].updatedAt = new Date().toISOString();

                // Set date if moved to non-ready and has no date
                if (targetStage !== '准备中' && !jobs[idx].date) {
                    jobs[idx].date = new Date().toISOString().split('T')[0];
                }

                saveAllData();
                renderKanban();
                triggerSystemNotification('OfferFlow 看板变更', `「${jobs[idx].company}」投递移入：${targetStage}`);
            }
        });

        // Delete stage binder
        row.querySelector('.btn-delete-stage').onclick = (e) => {
            e.stopPropagation();
            const stageToDelete = e.target.closest('.btn-delete-stage').dataset.stage;
            deleteStage(stageToDelete);
        };

        kanbanWrapper.appendChild(row);

        // Draw down arrow between stages (except the last one)
        if (index < settings.stages.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'flex justify-center text-slate-300 py-0.5';
            arrow.innerHTML = `<i class="fa-solid fa-arrow-down text-[10px]"></i>`;
            kanbanWrapper.appendChild(arrow);
        }
    });
}

// Stage creation and deletion logic
document.getElementById('btn-create-stage').addEventListener('click', () => {
    document.getElementById('form-new-stage').reset();
    openModal('modal-new-stage');
});

document.getElementById('form-new-stage').addEventListener('submit', (e) => {
    e.preventDefault();
    const newStageName = document.getElementById('stage-name-input').value.trim();

    if (!newStageName) return;
    if (settings.stages.includes(newStageName)) {
        alert('该流程阶段已存在！');
        return;
    }

    settings.stages.push(newStageName);
    saveAllData();
    closeModal('modal-new-stage');
    renderKanban();
    showToast(`新流程阶段「${newStageName}」已添加！`);
});

function deleteStage(stageName) {
    if (settings.stages.length <= 1) {
        alert('系统至少需要保留一个流程阶段。');
        return;
    }

    const countJobs = jobs.filter(j => j.status === stageName).length;

    let confirmMsg = `确定要删除「${stageName}」这个阶段吗？`;
    if (countJobs > 0) {
        confirmMsg = `该阶段下目前有 ${countJobs} 个投递岗位。删除此阶段后，这些卡片将自动移入第一个可用阶段，是否确认？`;
    }

    if (confirm(confirmMsg)) {
        // Remove stage from settings
        settings.stages = settings.stages.filter(s => s !== stageName);

        // Re-route jobs to the first remaining stage
        const fallbackStage = settings.stages[0];
        jobs.forEach(job => {
            if (job.status === stageName) {
                job.status = fallbackStage;
                job.updatedAt = new Date().toISOString();
            }
        });

        saveAllData();
        renderKanban();
        showToast(`阶段「${stageName}」已删除。`);
    }
}

// ==========================================
// 6. MODULE: Companies (公司管理)
// ==========================================
function renderCompaniesList() {
    const listContainer = document.getElementById('companies-list-container');
    listContainer.innerHTML = '';

    const filterVal = document.getElementById('company-search-box').value.toLowerCase().trim();
    let filteredComps = [...companies].sort((a, b) => a.name.localeCompare(b.name, 'zh'));

    if (filterVal) {
        filteredComps = filteredComps.filter(c => c.name.toLowerCase().includes(filterVal));
    }

    document.getElementById('company-total-badge').innerText = filteredComps.length;

    if (filteredComps.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">暂无公司档案</p>`;
        return;
    }

    filteredComps.forEach(comp => {
        const item = document.createElement('button');
        item.className = `w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between ${currentCompanyId === comp.id ? 'bg-[#4F7CFF]/8 text-[#4F7CFF]' : 'text-slate-600 hover:bg-slate-50'
            }`;

        const companyJobsCount = jobs.filter(j => j.companyId === comp.id).length;

        item.innerHTML = `
            <div class="flex items-center gap-2.5">
                <span class="text-sm">🏢</span>
                <span class="truncate font-semibold">${comp.name}</span>
            </div>
            <span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">${companyJobsCount} 个岗位</span>
        `;

        item.addEventListener('click', () => {
            selectCompany(comp.id);
        });

        listContainer.appendChild(item);
    });
}

function selectCompany(compId) {
    currentCompanyId = compId;
    renderCompaniesList();

    const comp = companies.find(c => c.id === compId);
    if (!comp) return;

    document.getElementById('company-empty-detail').classList.add('hidden');
    document.getElementById('company-main-detail').classList.remove('hidden');

    document.getElementById('comp-detail-name').innerText = comp.name;
    document.getElementById('comp-detail-loc').innerHTML = `<i class="fa-solid fa-map-marker-alt"></i> ${comp.location || '北京/待定'}`;

    const webLink = document.getElementById('comp-detail-web-link');
    if (comp.website) {
        webLink.href = comp.website;
        webLink.classList.remove('hidden');
    } else {
        webLink.classList.add('hidden');
    }

    document.getElementById('comp-detail-intro').innerText = comp.intro || '暂无公司背景介绍。';
    document.getElementById('comp-detail-hr').innerText = comp.hrContact || '暂无 HR 联系方式';
    document.getElementById('comp-detail-dept').innerText = comp.department || '未录入';
    document.getElementById('comp-detail-notes').value = comp.notes || '';

    // Save notes
    document.getElementById('btn-save-company-notes').onclick = () => {
        comp.notes = document.getElementById('comp-detail-notes').value.trim();
        saveAllData();
        showToast('公司备忘已更新');
    };

    // Associated positions
    const jobsList = document.getElementById('comp-detail-jobs-list');
    jobsList.innerHTML = '';
    const compJobs = jobs.filter(j => j.companyId === compId);

    if (compJobs.length === 0) {
        jobsList.innerHTML = `<p class="text-xs text-slate-400">暂无在此公司投递的岗位</p>`;
    } else {
        compJobs.forEach(job => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-3 bg-slate-50 border border-slate-200/40 rounded-xl hover:bg-slate-100/50 cursor-pointer transition';
            row.innerHTML = `
                <div>
                    <p class="text-xs font-semibold text-slate-800">${job.position}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">${job.date || '无日期'} • ${job.platform || '手动'}</p>
                </div>
                <span class="px-2 py-0.5 text-[9px] font-bold rounded-md bg-slate-200 text-slate-600">${job.status}</span>
            `;
            row.addEventListener('click', () => {
                openJobDrawer(job.id);
            });
            jobsList.appendChild(row);
        });
    }

    // Timeline
    const timeline = document.getElementById('comp-detail-timeline');
    timeline.innerHTML = '';

    const events = [];
    compJobs.forEach(j => {
        if (j.createdAt) {
            events.push({ time: new Date(j.createdAt), label: `登记新增岗位「${j.position}」，初始状态为【${j.status}】` });
        }
        if (j.date) {
            events.push({ time: new Date(j.date), label: `正式向官网或平台递交「${j.position}」申请` });
        }
    });

    const relatedEvents = calendarEvents.filter(e => compJobs.some(j => j.id === e.jobId));
    relatedEvents.forEach(e => {
        events.push({ time: new Date(e.date), label: `日程提醒: ${e.title} (${getEventLabel(e.type)})` });
    });

    if (events.length === 0) {
        timeline.innerHTML = `<p class="text-xs text-slate-400">暂无事件记录</p>`;
    } else {
        events.sort((a, b) => b.time - a.time);
        events.forEach(ev => {
            const row = document.createElement('div');
            row.className = 'relative pb-1';
            row.innerHTML = `
                <span class="absolute top-1 left-[-21px] w-2 h-2 rounded-full bg-brand-500 ring-4 ring-white"></span>
                <span class="text-[9px] font-bold text-slate-400">${ev.time.toLocaleDateString()}</span>
                <p class="text-xs text-slate-600 mt-0.5 font-medium leading-relaxed">${ev.label}</p>
            `;
            timeline.appendChild(row);
        });
    }
}

function getEventLabel(type) {
    const t = { interview: '面试', followup: '跟进', deadline: '截至提醒' };
    return t[type] || type;
}

document.getElementById('company-search-box').addEventListener('input', renderCompaniesList);

// ==========================================
// 7. MODULE: Calendar (日历日程周视图)
// ==========================================
function renderCalendar() {
    const now = new Date();
    const currentDay = now.getDay();

    const monday = new Date(now);
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    monday.setDate(now.getDate() - distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 4);

    document.getElementById('calendar-week-range').innerText = `周日程跨度：${monday.toLocaleDateString()} 至 ${sunday.toLocaleDateString()}`;

    const columns = document.querySelectorAll('.calendar-day');
    columns.forEach(col => {
        const offset = parseInt(col.dataset.day) - 1;
        const currentColDate = new Date(monday);
        currentColDate.setDate(monday.getDate() + offset);

        col.querySelector('.calendar-date-num').innerText = currentColDate.getDate();

        if (currentColDate.toDateString() === now.toDateString()) {
            col.querySelector('.calendar-date-num').className = 'calendar-date-num block text-lg font-bold w-7 h-7 mx-auto rounded-full bg-brand-500 text-white flex items-center justify-center mt-1 shadow-md shadow-brand-500/20';
        } else {
            col.querySelector('.calendar-date-num').className = 'calendar-date-num block text-lg font-bold text-slate-800 mt-1';
        }

        const colDateStr = currentColDate.toISOString().split('T')[0];
        const eventBox = col.querySelector('.calendar-events-container');
        eventBox.innerHTML = '';

        const dailyEvents = calendarEvents.filter(e => e.date === colDateStr);
        const dailyTasks = tasks.filter(t => t.date === colDateStr);

        if (dailyEvents.length === 0 && dailyTasks.length === 0) {
            eventBox.innerHTML = `<div class="text-[10px] text-slate-300 text-center py-8 font-medium select-none cursor-pointer border border-dashed border-slate-100 hover:border-slate-300 rounded-xl" title="双击空白处添加独立日程">双击新增日程</div>`;
        } else {
            dailyEvents.forEach(ev => {
                const colorMap = {
                    interview: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
                    followup: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
                    deadline: 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                };
                const classes = colorMap[ev.type] || 'bg-brand-500/10 text-brand-600 border-brand-500/30';

                const card = document.createElement('div');
                card.className = `p-2 rounded-lg border text-[10px] font-bold shadow-sm leading-normal cursor-pointer hover:scale-[1.02] transition ${classes}`;
                card.innerHTML = `<div class="truncate">${ev.title}</div>`;

                card.addEventListener('click', () => {
                    if (ev.jobId) {
                        openJobDrawer(ev.jobId);
                    } else {
                        if (confirm(`删除日程「${ev.title}」？`)) {
                            calendarEvents = calendarEvents.filter(e => e.id !== ev.id);
                            saveAllData();
                            renderCalendar();
                        }
                    }
                });
                eventBox.appendChild(card);
            });

            dailyTasks.forEach(task => {
                const card = document.createElement('div');
                card.className = `p-2 rounded-lg border border-slate-200/50 bg-slate-50 text-[10px] text-slate-600 font-semibold shadow-sm flex items-center justify-between ${task.done ? 'opacity-40' : ''
                    }`;
                card.innerHTML = `
                    <span class="truncate ${task.done ? 'line-through' : ''}">${task.text}</span>
                    <i class="fa-solid ${task.done ? 'fa-check text-emerald-500' : 'fa-spinner text-slate-400'}"></i>
                `;

                card.addEventListener('click', () => {
                    task.done = !task.done;
                    saveAllData();
                    renderCalendar();
                });
                eventBox.appendChild(card);
            });
        }

        // Double click to quick add
        eventBox.ondblclick = (e) => {
            e.stopPropagation();
            document.getElementById('form-custom-event').reset();
            document.getElementById('event-date').value = colDateStr;
            document.getElementById('event-type').value = 'interview';

            const select = document.getElementById('event-job-id');
            select.innerHTML = '<option value="">-- 不关联任何岗位 --</option>';
            jobs.forEach(j => {
                select.innerHTML += `<option value="${j.id}">${j.company} - ${j.position}</option>`;
            });
            openModal('modal-custom-event');
        };
    });
}

document.getElementById('form-custom-event').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('event-title').value.trim();
    const type = document.getElementById('event-type').value;
    const date = document.getElementById('event-date').value;
    const jobId = document.getElementById('event-job-id').value;

    const eventId = 'evt_' + Date.now();
    calendarEvents.push({ id: eventId, title, type, date, jobId });

    const taskId = 'task_' + Date.now();
    tasks.push({ id: taskId, text: `${type === 'interview' ? '面试' : '跟进'}: ${title}`, done: false, date, jobId });

    saveAllData();
    closeModal('modal-custom-event');

    if (currentView === 'calendar') renderCalendar();
    if (currentView === 'dashboard') renderDashboard();

    showToast('日程任务保存成功！');
});

// ==========================================
// 8. MODULE: Analytics (数据透视与漏斗)
// ==========================================
function renderAnalytics() {
    const funnelContainer = document.getElementById('analytics-funnel-container');
    const platformContainer = document.getElementById('analytics-platform-container');

    funnelContainer.innerHTML = '';
    platformContainer.innerHTML = '';

    // Calculate funnel counts based on stages
    const countTotal = jobs.length;
    // Applied: status is not ready/wishlist
    const countApplied = jobs.filter(j => !j.status.includes('准备') && !j.status.includes('意向')).length;
    // Written: includes written, test, assessment, interview, hr, offer
    const countWritten = jobs.filter(j =>
        j.status.includes('测评') || j.status.includes('笔试') || j.status.includes('测试') ||
        j.status.includes('面试') || j.status.includes('面') || j.status.includes('Offer') || j.status.includes('录')
    ).length;
    // Interview: includes interview, hr, offer
    const countInterview = jobs.filter(j =>
        j.status.includes('面试') || j.status.includes('面') || j.status.includes('Offer') || j.status.includes('录')
    ).length;
    // Offer
    const countOffer = jobs.filter(j => j.status.includes('Offer') || j.status.includes('录') || j.status.includes('斩获')).length;

    const renderFunnelStep = (label, count, total) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'space-y-1.5';
        row.innerHTML = `
            <div class="flex justify-between items-center text-xs font-semibold">
                <span class="text-slate-500">${label}</span>
                <span class="text-slate-800 font-bold">${count} 岗位 <span class="text-brand-500 ml-1">(${pct}%)</span></span>
            </div>
            <div class="w-full bg-slate-50 rounded-xl h-4 overflow-hidden border border-slate-200/40 relative">
                <div class="bg-gradient-to-r from-brand-500 to-indigo-500 h-4 rounded-xl transition-all duration-700 shadow-sm" style="width: ${pct}%"></div>
            </div>
        `;
        funnelContainer.appendChild(row);
    };

    renderFunnelStep('📋 已投递简历 (Applied)', countApplied, countTotal);
    renderFunnelStep('📝 笔试/测评阶段 (Written & Assessment)', countWritten, countApplied);
    renderFunnelStep('🎙 面试/终面推进 (Interview)', countInterview, countWritten);
    renderFunnelStep('🏆 最终斩获 Offer', countOffer, countInterview);

    // Platform channels response rates
    const platformMap = {};
    jobs.forEach(j => {
        const pf = j.platform || '手动录入';
        if (!platformMap[pf]) {
            platformMap[pf] = { total: 0, responded: 0 };
        }
        platformMap[pf].total++;
        if (!j.status.includes('准备') && !j.status.includes('已投递')) {
            platformMap[pf].responded++;
        }
    });

    const platformsSorted = Object.entries(platformMap).sort((a, b) => b[1].total - a[1].total);

    if (platformsSorted.length === 0) {
        platformContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">暂无渠道数据</p>`;
    } else {
        platformsSorted.forEach(([name, data]) => {
            const pct = data.total > 0 ? Math.round((data.responded / data.total) * 100) : 0;
            const bar = document.createElement('div');
            bar.className = 'space-y-1';
            bar.innerHTML = `
                <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-700">${name}</span>
                    <span class="text-slate-500 font-medium">投递: ${data.total} • 响应率: <span class="text-brand-500 font-bold">${pct}%</span></span>
                </div>
                <div class="w-full bg-slate-50 rounded-xl h-2 overflow-hidden border border-slate-200/40">
                    <div class="bg-indigo-500 h-2 rounded-xl" style="width: ${pct}%"></div>
                </div>
            `;
            platformContainer.appendChild(bar);
        });
    }
}

// ==========================================
// 9. MODULE: Drawer Details (岗位详情抽屉双栏)
// ==========================================
const drawer = document.getElementById('drawer-job-detail');
const drawerCloseBtn = document.getElementById('btn-close-drawer');
const drawerDeleteBtn = document.getElementById('btn-delete-drawer-card');

function openJobDrawer(jobId) {
    // Refresh selects options inside drawer
    populateStageSelects();

    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    document.getElementById('drawer-card-id').value = job.id;
    document.getElementById('drawer-card-company').value = job.company;
    document.getElementById('drawer-card-position').value = job.position;
    document.getElementById('drawer-card-status').value = job.status;
    document.getElementById('drawer-card-location').value = job.location || '';
    document.getElementById('drawer-card-url').value = job.url || '';
    document.getElementById('drawer-card-date').value = job.date || '';
    document.getElementById('drawer-card-platform').value = job.platform || '';
    document.getElementById('drawer-card-followup').value = job.followUpDays || settings.warningDays || 5;
    document.getElementById('drawer-card-salary').value = job.salary || '';
    document.getElementById('drawer-card-resume').value = job.resumeVersion || '';
    document.getElementById('drawer-card-rating').value = job.rating || '4';
    document.getElementById('drawer-card-jd').value = job.jd || '';
    document.getElementById('drawer-card-notes').value = job.notes || '';

    document.getElementById('drawer-header-title').innerText = `${job.company} - ${job.position}`;

    drawerChatHistory = [];
    renderDrawerChat();

    drawer.classList.remove('translate-x-full');
}

function closeJobDrawer() {
    drawer.classList.add('translate-x-full');
}

drawerCloseBtn.addEventListener('click', closeJobDrawer);

document.getElementById('form-drawer-job').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('drawer-card-id').value;
    if (!id) return;

    const index = jobs.findIndex(j => j.id === id);
    if (index > -1) {
        const company = document.getElementById('drawer-card-company').value.trim();
        const position = document.getElementById('drawer-card-position').value.trim();
        const status = document.getElementById('drawer-card-status').value;
        const location = document.getElementById('drawer-card-location').value.trim();
        const url = document.getElementById('drawer-card-url').value.trim();
        const date = document.getElementById('drawer-card-date').value;
        const platform = document.getElementById('drawer-card-platform').value.trim();
        const followUpDays = parseInt(document.getElementById('drawer-card-followup').value) || 5;
        const salary = document.getElementById('drawer-card-salary').value.trim();
        const resumeVersion = document.getElementById('drawer-card-resume').value.trim();
        const rating = document.getElementById('drawer-card-rating').value;
        const jd = document.getElementById('drawer-card-jd').value.trim();
        const notes = document.getElementById('drawer-card-notes').value.trim();

        const isStatusChanged = jobs[index].status !== status;
        const now = new Date().toISOString();

        jobs[index] = {
            ...jobs[index],
            company,
            position,
            status,
            location,
            url,
            date,
            platform,
            followUpDays,
            salary,
            resumeVersion,
            rating,
            jd,
            notes,
            updatedAt: isStatusChanged ? now : (jobs[index].updatedAt || now)
        };

        saveAllData();
        renderKanban();
        closeJobDrawer();
        showToast('修改已保存');
    }
});

drawerDeleteBtn.addEventListener('click', () => {
    const id = document.getElementById('drawer-card-id').value;
    if (!id) return;

    if (confirm('确认要删除此岗位？')) {
        jobs = jobs.filter(j => j.id !== id);
        saveAllData();
        renderKanban();
        closeJobDrawer();
        showToast('已成功删除');
    }
});

// Settings Save trigger settings
function renderSettings() {
    document.getElementById('set-base-url').value = settings.baseUrl;
    document.getElementById('set-api-key').value = settings.apiKey;
    document.getElementById('set-model-name').value = settings.modelName;
    document.getElementById('set-warning-days').value = settings.warningDays;
    document.getElementById('set-enable-notif').checked = settings.enableNotif;
    document.getElementById('set-resume-text').value = settings.resumeText || '';
}

document.getElementById('btn-save-settings').addEventListener('click', () => {
    settings.baseUrl = document.getElementById('set-base-url').value.trim();
    settings.apiKey = document.getElementById('set-api-key').value.trim();
    settings.modelName = document.getElementById('set-model-name').value.trim();
    settings.warningDays = parseInt(document.getElementById('set-warning-days').value) || 5;
    settings.resumeText = document.getElementById('set-resume-text').value.trim();

    const wasNotifEnabled = settings.enableNotif;
    settings.enableNotif = document.getElementById('set-enable-notif').checked;

    if (settings.enableNotif && !wasNotifEnabled) {
        requestNotificationPermission();
    }

    saveAllData();
    showToast('系统配置保存成功！');
});

// ==========================================
// 10. AI API Integration & New Application Parser
// ==========================================
const triggerNewAppBtn = document.getElementById('btn-trigger-new-app');
const submitNewAppBtn = document.getElementById('btn-submit-new-app');
const newAppSpinner = document.getElementById('new-app-spinner');
const newAppBtnText = document.getElementById('new-app-btn-text');

triggerNewAppBtn.addEventListener('click', () => {
    document.getElementById('parse-jd-input').value = '';
    document.getElementById('parse-url-input').value = '';
    openModal('modal-new-app');
});

submitNewAppBtn.addEventListener('click', async () => {
    const jdInput = document.getElementById('parse-jd-input').value.trim();
    const urlInput = document.getElementById('parse-url-input').value.trim();

    if (!jdInput) {
        showToast('请先输入 JD 文本！');
        return;
    }

    if (!settings.apiKey) {
        showToast('请先在配置中填入您的 API Key！');
        return;
    }

    submitNewAppBtn.disabled = true;
    submitNewAppBtn.classList.add('opacity-75', 'cursor-not-allowed');
    newAppSpinner.classList.remove('hidden');
    newAppBtnText.innerText = 'AI 分析中...';

    try {
        const result = await callModelAPI([
            {
                role: 'system',
                content: `你是一个专业的求职数据解析助手。请解析用户黏贴的招聘要求（JD），提取出结构化的求职信息，并【仅】以 JSON 格式输出。
不要输出 markdown 的 \`\`\`json\`\`\` 围栏，不要包含任何解释或说明，必须只返回一个纯 JSON 字符串。
JSON 对象结构如下：
{
  "company": "公司或雇主名称（例如：腾讯、字节跳动、网易。如无法确定，设为空字符串）",
  "position": "招聘岗位名称（例如：产品实习生、前端开发工程师。如无法确定，设为空字符串）",
  "location": "工作城市，例如：深圳、北京，如果远程则填远程，无法提取设为空字符串",
  "jd": "用一段简短的话归纳岗位职责和硬性核心要求（200字以内，包含核心技术栈）"
}`
            },
            {
                role: 'user',
                content: `请帮我解析这段招聘内容：\n\n${jdInput}`
            }
        ]);

        const jsonStr = extractJsonString(result);
        const parsed = JSON.parse(jsonStr);

        // Autofill preview confirmation
        document.getElementById('confirm-company').value = parsed.company || '';
        document.getElementById('confirm-position').value = parsed.position || '';
        document.getElementById('confirm-location').value = parsed.location || '';
        document.getElementById('confirm-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('confirm-status').value = settings.stages[1] || '已投递'; // Default Second Stage (Applied)
        document.getElementById('confirm-followup').value = settings.warningDays || 5;
        document.getElementById('confirm-platform').value = getPlatformFromUrl(urlInput);
        document.getElementById('confirm-url').value = urlInput;
        document.getElementById('confirm-jd').value = parsed.jd || jdInput.substring(0, 300);

        closeModal('modal-new-app');
        openModal('modal-ai-confirm');

    } catch (err) {
        console.error(err);
        alert('AI 解析失败：' + err.message);
    } finally {
        submitNewAppBtn.disabled = false;
        submitNewAppBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        newAppSpinner.classList.add('hidden');
        newAppBtnText.innerText = '⚡ 智能识别解析';
    }
});

document.getElementById('form-ai-confirm').addEventListener('submit', (e) => {
    e.preventDefault();

    const companyName = document.getElementById('confirm-company').value.trim();
    const position = document.getElementById('confirm-position').value.trim();
    const location = document.getElementById('confirm-location').value.trim();
    const date = document.getElementById('confirm-date').value;
    const status = document.getElementById('confirm-status').value;
    const followUpDays = parseInt(document.getElementById('confirm-followup').value) || 5;
    const platform = document.getElementById('confirm-platform').value.trim();
    const url = document.getElementById('confirm-url').value.trim();
    const jd = document.getElementById('confirm-jd').value.trim();

    // 1. Company implicit building
    let comp = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
    if (!comp) {
        comp = {
            id: 'comp_' + Date.now(),
            name: companyName,
            intro: `由 AI 自动生成绑定。该司下在投岗位：${position}。`,
            website: url ? new URL(url).origin : '',
            hrContact: '',
            department: '',
            location: location,
            notes: '',
            createdAt: new Date().toISOString()
        };
        companies.push(comp);
    }

    // 2. New card
    const newJob = {
        id: 'job_' + Date.now(),
        companyId: comp.id,
        company: comp.name,
        position,
        status,
        location,
        url,
        date,
        followUpDays,
        platform,
        salary: '',
        resumeVersion: '',
        rating: '4',
        jd,
        notes: '由 AI 解析后确认录入。',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    jobs.push(newJob);

    // 3. Auto create calendar deadline event
    const deadlineDate = new Date(new Date(date).getTime() + (followUpDays * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    calendarEvents.push({
        id: 'evt_' + Date.now(),
        title: `${comp.name} 进度跟进`,
        type: 'followup',
        date: deadlineDate,
        jobId: newJob.id
    });

    saveAllData();
    closeModal('modal-ai-confirm');

    if (currentView === 'applications') renderKanban();
    if (currentView === 'dashboard') renderDashboard();

    showToast(`岗位「${newJob.company}」已加入看板！`);
});

// Settings / Manual Cards add
document.getElementById('form-job-card').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('card-id').value;
    const companyName = document.getElementById('card-company').value.trim();
    const position = document.getElementById('card-position').value.trim();
    const status = document.getElementById('card-status').value;
    const location = document.getElementById('card-location').value.trim();
    const url = document.getElementById('card-url').value.trim();
    const date = document.getElementById('card-date').value;
    const followUpDays = parseInt(document.getElementById('card-followup').value) || 5;
    const jd = document.getElementById('card-jd').value.trim();
    const notes = document.getElementById('card-notes').value.trim();

    const now = new Date().toISOString();

    // Find or create company
    let comp = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
    if (!comp) {
        comp = {
            id: 'comp_' + Date.now(),
            name: companyName,
            intro: `手动建立。关联岗位：${position}。`,
            website: url ? new URL(url).origin : '',
            hrContact: '',
            department: '',
            location: location,
            notes: '',
            createdAt: now
        };
        companies.push(comp);
    }

    if (id) {
        const index = jobs.findIndex(j => j.id === id);
        if (index > -1) {
            const isStatusChanged = jobs[index].status !== status;
            jobs[index] = {
                ...jobs[index],
                companyId: comp.id,
                company: comp.name,
                position,
                status,
                location,
                url,
                date,
                followUpDays,
                jd,
                notes,
                updatedAt: isStatusChanged ? now : (jobs[index].updatedAt || now)
            };
        }
    } else {
        jobs.push({
            id: 'job_' + Date.now(),
            companyId: comp.id,
            company: comp.name,
            position,
            status,
            location,
            url,
            date,
            followUpDays,
            platform: '手动记录',
            salary: '',
            resumeVersion: '',
            rating: '4',
            jd,
            notes,
            createdAt: now,
            updatedAt: now
        });
    }

    saveAllData();
    closeModal('modal-edit-card');
    renderKanban();
    showToast('岗位已保存');
});

// API helper
async function callModelAPI(messages) {
    const url = `${settings.baseUrl}/chat/completions`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.modelName,
            messages: messages,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`接口响应错误 (状态码 ${response.status}): ${errText}`);
    }

    const result = await response.json();
    return result.choices[0].message.content;
}

function extractJsonString(raw) {
    let clean = raw.trim();
    if (clean.includes('```')) {
        const matches = clean.match(/```(?:json)?([\s\S]*?)```/);
        if (matches && matches[1]) {
            clean = matches[1].trim();
        }
    }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
    }
    return clean;
}

function getPlatformFromUrl(urlStr) {
    if (!urlStr) return '手动录入';
    try {
        const url = new URL(urlStr);
        if (url.hostname.includes('zhipin')) return 'Boss直聘';
        if (url.hostname.includes('lagou')) return '拉勾';
        if (url.hostname.includes('nowcoder')) return '牛客';
        if (url.hostname.includes('163') || url.hostname.includes('netease')) return '网易招聘';
        return '官网投递';
    } catch (e) {
        return '官网投递';
    }
}

// ==========================================
// 11. Global Chat Bot Rendering
// ==========================================
const globalChatMessages = document.getElementById('global-chat-messages');
const globalChatForm = document.getElementById('global-chat-form');
const globalChatInput = document.getElementById('global-chat-input');

function renderGlobalChat() {
    globalChatMessages.innerHTML = `
        <div class="flex gap-2">
            <div class="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0 text-xs">
                <i class="fa-solid fa-robot"></i>
            </div>
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[85%] text-slate-700 shadow-sm leading-relaxed">
                你好！我是你的求职管家小助手。你可以问我关于：
                <ul class="list-disc list-inside mt-2 space-y-1 text-slate-500 text-xs">
                    <li>你目前整体的投递数据以及阶段转化率？</li>
                    <li>分析哪些投递岗位严重超时需立刻跟进？</li>
                    <li>结合你的个人简历，为你提供秋招的定制化备战方案？</li>
                </ul>
            </div>
        </div>
    `;

    globalChatHistory.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`;

        const iconHtml = msg.role === 'user'
            ? `<div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0 text-xs">
                    <i class="fa-solid fa-user"></i>
               </div>`
            : `<div class="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0 text-xs">
                    <i class="fa-solid fa-robot"></i>
               </div>`;

        const contentHtml = msg.role === 'user'
            ? `<div class="bg-brand-500 text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[80%] text-xs whitespace-pre-wrap">${msg.content}</div>`
            : `<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[80%] text-xs text-slate-800 shadow-sm prose prose-slate leading-relaxed">${marked.parse(msg.content)}</div>`;

        msgDiv.innerHTML = iconHtml + contentHtml;
        globalChatMessages.appendChild(msgDiv);
    });
    globalChatMessages.scrollTop = globalChatMessages.scrollHeight;
}

globalChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = globalChatInput.value.trim();
    if (!query) return;

    if (!settings.apiKey) {
        alert('请先到系统设置中配置大模型的 API Key。');
        return;
    }

    globalChatHistory.push({ role: 'user', content: query });
    globalChatInput.value = '';
    renderGlobalChat();

    const typing = document.createElement('div');
    typing.id = 'global-chat-typing';
    typing.className = 'flex gap-2.5';
    typing.innerHTML = `
        <div class="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0 text-xs">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 text-slate-400 text-xs">
            智能管家正在深度诊断你的求职状态<span class="animate-pulse">...</span>
        </div>
    `;
    globalChatMessages.appendChild(typing);
    globalChatMessages.scrollTop = globalChatMessages.scrollHeight;

    try {
        const simplified = jobs.map(j => ({
            company: j.company,
            position: j.position,
            status: j.status,
            location: j.location,
            date: j.date
        }));

        const systemPrompt = `你是一个非常专业智能的秋招求职管家。以下是用户目前在本地记录的全部投递情况数据库：
${JSON.stringify(simplified, null, 2)}

以下是用户配置的个人简历文本：
${settings.resumeText || '（用户尚未配置个人简历）'}

当前时间是：2026年7月7日。
请注意：
1. 你的回答必须结合上面的投递状态。
2. 保持语言精简专业，用 Markdown 格式渲染（回答长度控制在300字内，多使用列表）。`;

        const response = await callModelAPI([
            { role: 'system', content: systemPrompt },
            ...globalChatHistory.slice(-8).map(m => ({ role: m.role, content: m.content }))
        ]);

        document.getElementById('global-chat-typing').remove();
        globalChatHistory.push({ role: 'assistant', content: response });
        saveAllData();
        renderGlobalChat();

    } catch (err) {
        console.error(err);
        document.getElementById('global-chat-typing').remove();
        alert('AI 分析出错了。详细错误: ' + err.message);
    }
});

document.getElementById('btn-clear-global-chat').addEventListener('click', () => {
    if (confirm('确认清空全部全局聊天记录吗？')) {
        globalChatHistory = [];
        saveAllData();
        renderGlobalChat();
    }
});

// Permanent Drawer AI Copilot Chat panel logic
const drawerChatMessages = document.getElementById('drawer-chat-messages');
const drawerChatForm = document.getElementById('drawer-chat-form');
const drawerChatInput = document.getElementById('drawer-chat-input');

function renderDrawerChat() {
    drawerChatMessages.innerHTML = `
        <div class="flex gap-2">
            <div class="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0 text-[10px]">
                <i class="fa-solid fa-robot"></i>
            </div>
            <div class="bg-white border border-slate-200/80 rounded-2xl rounded-tl-none px-3 py-2 max-w-[85%] text-slate-700 shadow-sm leading-relaxed">
                你好！我是你的求职顾问。点击上方快捷动作，我可以帮你看职位，也可以打字和我直接聊天。
            </div>
        </div>
    `;

    drawerChatHistory.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`;

        const iconHtml = msg.role === 'user'
            ? `<div class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0 text-[10px]">
                    <i class="fa-solid fa-user"></i>
               </div>`
            : `<div class="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0 text-[10px]">
                    <i class="fa-solid fa-robot"></i>
               </div>`;

        const contentHtml = msg.role === 'user'
            ? `<div class="bg-[#4F7CFF] text-white rounded-2xl rounded-tr-none px-3 py-2 max-w-[80%] text-[11px] whitespace-pre-wrap">${msg.content}</div>`
            : `<div class="bg-white border border-slate-200/85 rounded-2xl rounded-tl-none px-3 py-2 max-w-[80%] text-[11px] text-slate-800 shadow-sm prose prose-slate leading-relaxed">${marked.parse(msg.content)}</div>`;

        msgDiv.innerHTML = iconHtml + contentHtml;
        drawerChatMessages.appendChild(msgDiv);
    });
    drawerChatMessages.scrollTop = drawerChatMessages.scrollHeight;
}

drawerChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = drawerChatInput.value.trim();
    if (!query) return;

    if (!settings.apiKey) {
        alert('请配置 API Key。');
        return;
    }

    drawerChatHistory.push({ role: 'user', content: query });
    drawerChatInput.value = '';
    renderDrawerChat();

    triggerDrawerAITyping();

    try {
        const response = await callDrawerLLM(query);
        removeDrawerAITyping();
        drawerChatHistory.push({ role: 'assistant', content: response });
        renderDrawerChat();
    } catch (err) {
        console.error(err);
        removeDrawerAITyping();
        alert('AI 诊断失败，请重试。' + err.message);
    }
});

function triggerDrawerAITyping() {
    const typing = document.createElement('div');
    typing.id = 'drawer-chat-typing';
    typing.className = 'flex gap-2';
    typing.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 flex-shrink-0 text-[10px]">
            <i class="fa-solid fa-robot"></i>
        </div>
        <div class="bg-white border border-slate-200/85 rounded-2xl rounded-tl-none px-3 py-2 text-slate-400 text-[10px]">
            AI 顾问正在研读您的简历进行深度对比<span class="animate-pulse">...</span>
        </div>
    `;
    drawerChatMessages.appendChild(typing);
    drawerChatMessages.scrollTop = drawerChatMessages.scrollHeight;
}

function removeDrawerAITyping() {
    const indicator = document.getElementById('drawer-chat-typing');
    if (indicator) indicator.remove();
}

// Drawer quick action triggers
const drawerAiButtons = document.querySelectorAll('.btn-drawer-ai-action');
drawerAiButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        const actionType = btn.dataset.aiAction;
        if (!settings.apiKey) {
            alert('请先到 Settings 选项卡中配置大模型 API Key！');
            return;
        }

        let userPrompt = '';
        switch (actionType) {
            case 'summary':
                userPrompt = '请简短总结并提取当前岗位的核心职责和技术要求，以无序列表形式精炼输出。';
                break;
            case 'match':
                userPrompt = '请结合我的简历，详细对当前岗位进行匹配度评分（百分制），列出核心匹配点和劣势所在。';
                break;
            case 'suggest':
                userPrompt = '根据该岗位的要求，如果我要投递，应该怎么优化修改我的个人简历内容？请给出具体的简历润色话术建议。';
                break;
            case 'research':
                userPrompt = '请帮我调查研究一下招聘该岗位的公司背景、核心业务方向以及面试流程特点。';
                break;
            case 'questions':
                userPrompt = '针对该岗位（结合我的技术栈和简历经历），AI 预测 3 道最容易被问到的技术/业务面试真题，并附带最佳答题思路。';
                break;
            case 'email':
                userPrompt = '帮我撰写一份向 HR 咨询投递进展（或感谢信后寻求复盘意见）的专业跟进邮件草稿。';
                break;
        }

        drawerChatHistory.push({ role: 'user', content: `[${btn.innerText.trim()}]` });
        renderDrawerChat();
        triggerDrawerAITyping();

        try {
            const response = await callDrawerLLM(userPrompt);
            removeDrawerAITyping();
            drawerChatHistory.push({ role: 'assistant', content: response });
            renderDrawerChat();
        } catch (err) {
            console.error(err);
            removeDrawerAITyping();
            alert('AI 动作执行出错了：' + err.message);
        }
    });
});

async function callDrawerLLM(userQuery) {
    const company = document.getElementById('drawer-card-company').value.trim();
    const position = document.getElementById('drawer-card-position').value.trim();
    const jd = document.getElementById('drawer-card-jd').value.trim();
    const notes = document.getElementById('drawer-card-notes').value.trim();

    const systemPrompt = `你是一个秋招智能求职小助理，正在帮助用户备战和分析当前岗位。
当前岗位上下文：
- 公司: ${company}
- 岗位: ${position}
- 职责描述 (JD):
${jd || '（无具体要求）'}
- 进展备忘:
${notes || '（无进度）'}

以下是用户的个人简历文本：
${settings.resumeText || '（用户尚未配置个人简历）'}

请注意：
1. 你的回答必须结合上面的岗位 JD 和用户的简历来进行个性化对比。
2. 保持回答字数在300字以内，重点突出，采用简洁明了的 Markdown 格式。
3. 请给予具体和具有建设性的操作指引。`;

    return await callModelAPI([
        { role: 'system', content: systemPrompt },
        ...drawerChatHistory.slice(-8).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userQuery }
    ]);
}

// Add manual cards popups
document.getElementById('btn-add-manual').addEventListener('click', () => {
    // Populate select
    populateStageSelects();
    document.getElementById('form-job-card').reset();
    document.getElementById('card-id').value = '';
    document.getElementById('card-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('card-followup').value = settings.warningDays || 5;
    document.getElementById('modal-card-title').innerHTML = `<i class="fa-solid fa-plus text-indigo-400"></i> 手动录入岗位`;
    document.getElementById('btn-delete-card').classList.add('hidden');
    openModal('modal-edit-card');
});

function openEditModal(jobId) {
    populateStageSelects();

    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    document.getElementById('card-id').value = job.id;
    document.getElementById('card-company').value = job.company;
    document.getElementById('card-position').value = job.position;
    document.getElementById('card-status').value = job.status;
    document.getElementById('card-location').value = job.location || '';
    document.getElementById('card-url').value = job.url || '';
    document.getElementById('card-date').value = job.date || '';
    document.getElementById('card-followup').value = job.followUpDays || settings.warningDays || 5;
    document.getElementById('card-jd').value = job.jd || '';
    document.getElementById('card-notes').value = job.notes || '';

    document.getElementById('modal-card-title').innerHTML = `<i class="fa-solid fa-file-signature text-indigo-400"></i> 修改岗位信息`;
    document.getElementById('btn-delete-card').classList.remove('hidden');

    openModal('modal-edit-card');
}

document.getElementById('btn-delete-card').addEventListener('click', () => {
    const id = document.getElementById('card-id').value;
    if (!id) return;
    if (confirm('确定删除此岗位吗？')) {
        jobs = jobs.filter(j => j.id !== id);
        saveAllData();
        closeModal('modal-edit-card');
        renderKanban();
        showToast('已删除');
    }
});

// ==========================================
// 12. Helper UI Interactions & Listeners
// ==========================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('.glass-panel').classList.remove('scale-95');
    }, 10);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('opacity-0');
    modal.querySelector('.glass-panel').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function setupGlobalModalListeners() {
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.fixed');
            if (modal) closeModal(modal.id);
        });
    });
    document.querySelectorAll('.fixed').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
}

function showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900/90 text-white border border-slate-800 backdrop-blur-md px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg z-50 flex items-center gap-2 opacity-0 transition-opacity duration-300 pointer-events-none';
    toast.innerHTML = `<i class="fa-solid fa-circle-check text-brand-500"></i> ${text}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.remove('opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Global search input listener
searchInput.addEventListener('input', (e) => {
    searchFilterQuery = e.target.value;
    if (currentView === 'applications') {
        renderKanban();
    } else {
        switchTab('applications');
    }
});

// Board filters
const boardAllBtn = document.getElementById('board-filter-all');
const boardStaleBtn = document.getElementById('board-filter-stale');

boardAllBtn.addEventListener('click', () => {
    boardStaleOnly = false;
    boardAllBtn.className = 'px-3 py-1.5 bg-[#4F7CFF]/10 text-[#4F7CFF] border border-[#4F7CFF]/20 rounded-lg text-xs font-semibold transition active';
    boardStaleBtn.className = 'px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5';
    renderKanban();
});

boardStaleBtn.addEventListener('click', () => {
    boardStaleOnly = true;
    boardStaleBtn.className = 'px-3 py-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 active';
    boardAllBtn.className = 'px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-lg text-xs font-semibold transition';
    renderKanban();
});

// Notifications
function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function triggerSystemNotification(title, body) {
    if (!settings.enableNotif || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
        new Notification(title, { body });
    } catch (e) {
        console.error(e);
    }
}

function checkStaleNotificationsOnInit() {
    if (!settings.enableNotif || !("Notification" in window) || Notification.permission !== "granted") return;

    let overdueCount = 0;
    const now = new Date();

    jobs.forEach(job => {
        if (job.status !== '被拒/归档' && job.date) {
            const limit = job.followUpDays || settings.warningDays || 5;
            const deadline = new Date(job.date).getTime() + (limit * 24 * 60 * 60 * 1000);
            if (now.getTime() > deadline) overdueCount++;
        }
    });

    if (overdueCount > 0) {
        triggerSystemNotification('OfferFlow 跟进提醒', `你有 ${overdueCount} 个投递项目已经触发滞留警告，请快去查看跟进吧！`);
        document.getElementById('notif-badge').classList.remove('hidden');
    }
}

document.getElementById('btn-trigger-notif').addEventListener('click', () => {
    let overdueJobs = [];
    const now = new Date();
    jobs.forEach(job => {
        if (job.status !== '被拒/归档' && job.date) {
            const limit = job.followUpDays || settings.warningDays || 5;
            const deadline = new Date(job.date).getTime() + (limit * 24 * 60 * 60 * 1000);
            if (now.getTime() > deadline) overdueJobs.push(job);
        }
    });

    if (overdueJobs.length > 0) {
        alert(`超期需要跟进的岗位：\n\n` + overdueJobs.map(j => `• ${j.company} - ${j.position}`).join('\n') + `\n\n请在面板上切换“仅看超期滞留”查看。`);
    } else {
        alert('恭喜！目前没有超期没有更新的投递岗位。');
    }
    document.getElementById('notif-badge').classList.add('hidden');
});

// Import & Export
document.getElementById('btn-export').onclick = () => {
    if (jobs.length === 0) {
        showToast('没有数据可导出！');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ jobs, settings, companies, tasks, calendarEvents }));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `offerflow_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('备份数据已成功导出');
};

document.getElementById('btn-import').onclick = () => {
    document.getElementById('file-import-input').click();
};

document.getElementById('file-import-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (data.jobs && Array.isArray(data.jobs)) {
                jobs = data.jobs;
                if (data.companies) companies = data.companies;
                if (data.tasks) tasks = data.tasks;
                if (data.calendarEvents) calendarEvents = data.calendarEvents;
                if (data.settings) settings = { ...settings, ...data.settings };

                saveAllData();
                renderViewData(currentView);
                showToast('已成功导入备份数据');
            } else {
                alert('JSON 格式不正确');
            }
        } catch (err) {
            alert('解析失败：' + err.message);
        }
    };
    reader.readAsText(file);
};

// Dom initialization
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    initNavigation();
    setupGlobalModalListeners();

    setTimeout(() => {
        checkStaleNotificationsOnInit();
    }, 1500);
});
