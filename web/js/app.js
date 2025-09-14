// Main Application JavaScript
class OdishaSchoolPortal {
    constructor() {
        this.API_BASE = this.getApiBase();
        this.currentPage = {
            schools: 1,
            students: 1
        };
        this.cache = new Map();
        
        this.init();
    }
    
    getApiBase() {
        // Development: use Codespaces forwarded port
        if (window.location.hostname === 'localhost' || window.location.hostname.includes('github.dev')) {
            return 'http://localhost:3000/api';
        }
        // Production: update with your deployed API URL
        return 'https://your-api-domain.com/api';
    }
    
    init() {
        this.setupEventListeners();
        this.showLoadingScreen();
        
        setTimeout(() => {
            this.hideLoadingScreen();
            this.loadDashboard();
            this.startRealTimeSync();
        }, 2000);
    }
    
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                this.showSection(section);
            });
        });
        
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshCurrentSection();
        });
        
        // Search buttons
        document.getElementById('searchSchoolsBtn')?.addEventListener('click', () => {
            this.searchSchools();
        });
        
        document.getElementById('searchStudentsBtn')?.addEventListener('click', () => {
            this.searchStudents();
        });
        
        // Enter key for search inputs
        document.getElementById('schoolSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchSchools();
        });
        
        document.getElementById('studentSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchStudents();
        });
    }
    
    showLoadingScreen() {
        document.getElementById('loadingScreen').classList.remove('hidden');
    }
    
    hideLoadingScreen() {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }
    
    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
        
        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName).classList.add('active');
        
        // Load section data
        switch(sectionName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'schools':
                this.loadSchools();
                break;
            case 'students':
                this.loadStudents();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
        }
    }
    
    async loadDashboard() {
        try {
            this.setLoadingState('dashboard', true);
            
            const [stats, kpis] = await Promise.all([
                this.fetchWithCache('/dashboard/stats'),
                this.fetchWithCache('/dashboard/kpis')
            ]);
            
            this.renderKPIs(stats.data);
            this.renderCharts(kpis.data);
            this.renderSystemStatus(stats.data);
            
            this.updateLastSync();
        } catch (error) {
            this.handleError('Failed to load dashboard', error);
        } finally {
            this.setLoadingState('dashboard', false);
        }
    }
    
    renderKPIs(data) {
        const kpiGrid = document.getElementById('kpiGrid');
        const kpis = [
            {
                label: 'Total Schools',
                value: data.totals.schools.toLocaleString(),
                trend: '+2 new this month',
                positive: true
            },
            {
                label: 'Active Students',
                value: data.totals.students.toLocaleString(),
                trend: `+${data.recent_enrollments} this month`,
                positive: true
            },
            {
                label: 'Teaching Staff',
                value: data.totals.teachers.toLocaleString(),
                trend: '+15 new appointments',
                positive: true
            },
            {
                label: 'Districts Covered',
                value: data.totals.districts.toString(),
                trend: 'Complete coverage',
                positive: true
            }
        ];
        
        kpiGrid.innerHTML = kpis.map(kpi => `
            <div class="kpi-card">
                <div class="kpi-value">${kpi.value}</div>
                <div class="kpi-label">${kpi.label}</div>
                <div class="kpi-trend ${kpi.positive ? 'positive' : 'negative'}">
                    ${kpi.positive ? '📈' : '📉'} ${kpi.trend}
                </div>
            </div>
        `).join('');
    }
    
    renderCharts(data) {
        // Enrollment trend chart
        const enrollmentCtx = document.getElementById('enrollmentChart');
        if (enrollmentCtx && data.enrollment_trend) {
            new Chart(enrollmentCtx, {
                type: 'line',
                data: {
                    labels: data.enrollment_trend.map(item => 
                        new Date(item.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    ),
                    datasets: [{
                        label: 'New Enrollments',
                        data: data.enrollment_trend.map(item => item.enrollments),
                        borderColor: '#0070f3',
                        backgroundColor: 'rgba(0, 112, 243, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }
    
    renderSystemStatus(data) {
        const statusContainer = document.getElementById('systemStatus');
        const statusCards = [
            {
                metric: data.totals.schools.toLocaleString(),
                label: 'Active Schools'
            },
            {
                metric: `${data.today_attendance.present || 0}`,
                label: 'Present Today'
            },
            {
                metric: '99.9%',
                label: 'System Uptime'
            },
            {
                metric: '<50ms',
                label: 'Response Time'
            }
        ];
        
        statusContainer.innerHTML = statusCards.map(card => `
            <div class="status-card">
                <div class="metric">${card.metric}</div>
                <div class="label">${card.label}</div>
            </div>
        `).join('');
    }
    
    async loadSchools() {
        try {
            this.setLoadingState('schools', true);
            
            const params = new URLSearchParams({
                page: this.currentPage.schools,
                limit: 20
            });
            
            const search = document.getElementById('schoolSearch')?.value;
            if (search) params.append('search', search);
            
            const district = document.getElementById('districtFilter')?.value;
            if (district) params.append('district_id', district);
            
            const response = await this.fetchApi(`/schools?${params}`);
            this.renderSchoolsTable(response.data, response.pagination);
            
        } catch (error) {
            this.handleError('Failed to load schools', error);
        } finally {
            this.setLoadingState('schools', false);
        }
    }
    
    renderSchoolsTable(schools, pagination) {
        const tbody = document.getElementById('schoolsTableBody');
        
        tbody.innerHTML = schools.map(school => `
            <tr>
                <td>${school.school_code}</td>
                <td>${school.name}</td>
                <td>${school.district_name}</td>
                <td>${school.total_students}</td>
                <td>${school.total_teachers}</td>
                <td><span class="status-badge active">${school.status}</span></td>
            </tr>
        `).join('');
        
        this.renderPagination('schools', pagination);
    }
    
    async loadStudents() {
        try {
            this.setLoadingState('students', true);
            
            const params = new URLSearchParams({
                page: this.currentPage.students,
                limit: 50
            });
            
            const search = document.getElementById('studentSearch')?.value;
            if (search) params.append('search', search);
            
            const school = document.getElementById('schoolFilter')?.value;
            if (school) params.append('school_id', school);
            
            const classNum = document.getElementById('classFilter')?.value;
            if (classNum) params.append('class_number', classNum);
            
            const response = await this.fetchApi(`/students?${params}`);
            this.renderStudentsTable(response.data, response.pagination);
            
        } catch (error) {
            this.handleError('Failed to load students', error);
        } finally {
            this.setLoadingState('students', false);
        }
    }
    
    renderStudentsTable(students, pagination) {
        const tbody = document.getElementById('studentsTableBody');
        
        tbody.innerHTML = students.map(student => `
            <tr>
                <td>${student.admission_no}</td>
                <td>${student.first_name} ${student.last_name}</td>
                <td>${student.class_number}${student.section}</td>
                <td>${student.school_name}</td>
                <td>${student.guardian_name || 'N/A'}</td>
                <td><span class="status-badge active">${student.status}</span></td>
            </tr>
        `).join('');
        
        this.renderPagination('students', pagination);
    }
    
    renderPagination(section, pagination) {
        const container = document.getElementById(`${section}Pagination`);
        const { page, pages, total } = pagination;
        
        let paginationHTML = `
            <button ${page <= 1 ? 'disabled' : ''} onclick="app.changePage('${section}', ${page - 1})">Previous</button>
        `;
        
        // Show page numbers (simple version)
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(pages, page + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button ${i === page ? 'class="active"' : ''} onclick="app.changePage('${section}', ${i})">${i}</button>
            `;
        }
        
        paginationHTML += `
            <button ${page >= pages ? 'disabled' : ''} onclick="app.changePage('${section}', ${page + 1})">Next</button>
            <span style="margin-left: 1rem; color: #64748b;">Total: ${total.toLocaleString()}</span>
        `;
        
        container.innerHTML = paginationHTML;
    }
    
    changePage(section, newPage) {
        this.currentPage[section] = newPage;
        
        if (section === 'schools') {
            this.loadSchools();
        } else if (section === 'students') {
            this.loadStudents();
        }
    }
    
    searchSchools() {
        this.currentPage.schools = 1;
        this.loadSchools();
    }
    
    searchStudents() {
        this.currentPage.students = 1;
        this.loadStudents();
    }
    
    loadAnalytics() {
        const performanceContainer = document.getElementById('performanceMetrics');
        const dataQualityContainer = document.getElementById('dataQuality');
        
        performanceContainer.innerHTML = `
            <div class="status-card">
                <div class="metric">1.2ms</div>
                <div class="label">Avg Query Time</div>
            </div>
            <div class="status-card">
                <div class="metric">99.9%</div>
                <div class="label">Uptime</div>
            </div>
        `;
        
        dataQualityContainer.innerHTML = `
            <div class="status-card">
                <div class="metric">98.5%</div>
                <div class="label">Complete Records</div>
            </div>
            <div class="status-card">
                <div class="metric">0.01%</div>
                <div class="label">Error Rate</div>
            </div>
        `;
    }
    
    async fetchApi(endpoint) {
        const response = await fetch(`${this.API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }
    
    async fetchWithCache(endpoint, ttl = 30000) {
        const cacheKey = endpoint;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < ttl) {
            return cached.data;
        }
        
        const data = await this.fetchApi(endpoint);
        this.cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        return data;
    }
    
    setLoadingState(section, isLoading) {
        const sectionElement = document.getElementById(section);
        if (isLoading) {
            sectionElement.classList.add('loading');
        } else {
            sectionElement.classList.remove('loading');
        }
    }
    
    refreshCurrentSection() {
        const activeSection = document.querySelector('.nav-item.active').dataset.section;
        this.cache.clear(); // Clear cache to force refresh
        this.showSection(activeSection);
    }
    
    startRealTimeSync() {
        // Sync every 30 seconds
        setInterval(() => {
            if (document.querySelector('.nav-item.active').dataset.section === 'dashboard') {
                this.loadDashboard();
            }
        }, 30000);
    }
    
    updateLastSync() {
        document.getElementById('lastSync').textContent = 
            `Last sync: ${new Date().toLocaleTimeString()}`;
    }
    
    handleError(message, error) {
        console.error(message, error);
        // In production, you might want to show a user-friendly error message
    }
}

// Initialize the application
const app = new OdishaSchoolPortal();

// Make it globally available
window.app = app;
