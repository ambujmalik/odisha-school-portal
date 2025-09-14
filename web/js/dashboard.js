// Advanced Dashboard Features for Odisha School Portal
class DashboardManager {
    constructor(app) {
        this.app = app;
        this.charts = {};
        this.realTimeUpdates = true;
        this.updateInterval = 30000; // 30 seconds
        this.intervalId = null;
        
        this.init();
    }
    
    init() {
        this.setupRealTimeUpdates();
        this.setupAdvancedCharts();
        this.setupWebSocket();
    }
    
    setupRealTimeUpdates() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            if (this.realTimeUpdates && this.isOnDashboard()) {
                this.updateDashboardData();
            }
        }, this.updateInterval);
    }
    
    setupAdvancedCharts() {
        // Performance monitoring chart
        this.createPerformanceChart();
        
        // Real-time attendance chart
        this.createAttendanceChart();
        
        // Geographic distribution chart
        this.createGeographicChart();
    }
    
    async updateDashboardData() {
        try {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`🔄 Real-time update at ${timestamp}`);
            
            // Update KPIs with animation
            await this.updateKPIsAnimated();
            
            // Update charts
            await this.updateChartsData();
            
            // Update system metrics
            await this.updateSystemMetrics();
            
            // Update last sync time
            this.updateSyncStatus(timestamp);
            
        } catch (error) {
            console.error('Real-time update failed:', error);
            this.handleUpdateError(error);
        }
    }
    
    async updateKPIsAnimated() {
        try {
            const stats = await this.app.fetchWithCache('/dashboard/stats', 5000); // 5s cache
            
            const kpiCards = document.querySelectorAll('.kpi-card');
            kpiCards.forEach((card, index) => {
                card.style.transform = 'scale(1.02)';
                card.style.transition = 'transform 0.3s ease';
                
                setTimeout(() => {
                    card.style.transform = 'scale(1)';
                }, 300);
            });
            
            // Animate counter updates
            this.animateNumbers(stats.data);
            
        } catch (error) {
            console.error('KPI update failed:', error);
        }
    }
    
    animateNumbers(data) {
        const counters = [
            { element: '.kpi-card:nth-child(1) .kpi-value', value: data.totals.schools },
            { element: '.kpi-card:nth-child(2) .kpi-value', value: data.totals.students },
            { element: '.kpi-card:nth-child(3) .kpi-value', value: data.totals.teachers },
            { element: '.kpi-card:nth-child(4) .kpi-value', value: data.totals.districts }
        ];
        
        counters.forEach(counter => {
            const element = document.querySelector(counter.element);
            if (element) {
                this.animateCounter(element, counter.value);
            }
        });
    }
    
    animateCounter(element, targetValue) {
        const currentValue = parseInt(element.textContent.replace(/,/g, '')) || 0;
        const difference = targetValue - currentValue;
        const duration = 1000; // 1 second
        const steps = 60; // 60 FPS
        const increment = difference / steps;
        
        let current = currentValue;
        let step = 0;
        
        const timer = setInterval(() => {
            step++;
            current += increment;
            
            if (step >= steps) {
                current = targetValue;
                clearInterval(timer);
            }
            
            element.textContent = Math.round(current).toLocaleString();
        }, duration / steps);
    }
    
    async updateChartsData() {
        try {
            const kpiData = await this.app.fetchWithCache('/dashboard/kpis', 10000);
            
            // Update enrollment chart
            if (this.charts.enrollment) {
                this.updateEnrollmentChart(kpiData.data.enrollment_trend);
            }
            
            // Update attendance chart
            if (this.charts.attendance) {
                this.updateAttendanceChart();
            }
            
            // Update district chart
            if (this.charts.district) {
                this.updateDistrictChart();
            }
            
        } catch (error) {
            console.error('Chart update failed:', error);
        }
    }
    
    createPerformanceChart() {
        const ctx = document.createElement('canvas');
        ctx.id = 'performanceChart';
        
        // Add to dashboard if container exists
        const container = document.querySelector('.charts-section');
        if (container) {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.innerHTML = '<h3>System Performance</h3>';
            chartContainer.appendChild(ctx);
            container.appendChild(chartContainer);
            
            this.charts.performance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['API Response', 'Database', 'Network', 'Available'],
                    datasets: [{
                        data: [15, 25, 10, 50],
                        backgroundColor: [
                            '#ef4444',
                            '#f59e0b', 
                            '#3b82f6',
                            '#10b981'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    }
    
    createAttendanceChart() {
        const existingCanvas = document.getElementById('attendanceChart');
        if (existingCanvas) return; // Already exists
        
        const ctx = document.createElement('canvas');
        ctx.id = 'attendanceChart';
        
        const container = document.querySelector('.charts-section');
        if (container) {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.innerHTML = '<h3>Daily Attendance (Last 7 Days)</h3>';
            chartContainer.appendChild(ctx);
            container.appendChild(chartContainer);
            
            // Generate sample data for last 7 days
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            });
            
            this.charts.attendance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: last7Days,
                    datasets: [{
                        label: 'Present',
                        data: [42000, 41500, 43000, 42800, 44200, 0, 0], // Weekend = 0
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    }, {
                        label: 'Absent',
                        data: [8000, 8500, 7000, 7200, 5800, 0, 0],
                        backgroundColor: '#ef4444',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }
    
    createGeographicChart() {
        const ctx = document.createElement('canvas');
        ctx.id = 'geographicChart';
        
        const container = document.querySelector('.charts-section');
        if (container) {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.innerHTML = '<h3>Student Distribution by District</h3>';
            chartContainer.appendChild(ctx);
            container.appendChild(chartContainer);
            
            this.charts.district = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Khurda', 'Cuttack', 'Puri', 'Balasore', 'Mayurbhanj', 'Ganjam'],
                    datasets: [{
                        label: 'Students',
                        data: [8500, 7200, 6800, 6200, 5900, 8100],
                        borderColor: '#0070f3',
                        backgroundColor: 'rgba(0, 112, 243, 0.1)',
                        pointBackgroundColor: '#0070f3',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }
    
    updateEnrollmentChart(newData) {
        if (!this.charts.enrollment || !newData) return;
        
        const chart = this.charts.enrollment;
        
        // Add smooth animation
        chart.data.labels = newData.map(item => 
            new Date(item.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        );
        chart.data.datasets[0].data = newData.map(item => item.enrollments);
        
        chart.update('smooth');
    }
    
    updateAttendanceChart() {
        if (!this.charts.attendance) return;
        
        // Simulate real-time attendance updates
        const chart = this.charts.attendance;
        const todayIndex = new Date().getDay(); // 0 = Sunday, 6 = Saturday
        
        if (todayIndex >= 1 && todayIndex <= 5) { // Monday to Friday
            // Add some randomness to simulate real-time updates
            const basePresent = 42000;
            const baseAbsent = 8000;
            
            chart.data.datasets[0].data[todayIndex - 1] = basePresent + Math.floor(Math.random() * 2000);
            chart.data.datasets[1].data[todayIndex - 1] = baseAbsent - Math.floor(Math.random() * 1000);
            
            chart.update('none'); // No animation for real-time updates
        }
    }
    
    async updateSystemMetrics() {
        try {
            // Simulate system metrics
            const metrics = {
                cpuUsage: Math.random() * 30 + 20, // 20-50%
                memoryUsage: Math.random() * 20 + 60, // 60-80%
                diskUsage: Math.random() * 10 + 45, // 45-55%
                networkLatency: Math.random() * 20 + 10 // 10-30ms
            };
            
            this.updatePerformanceChart(metrics);
            
        } catch (error) {
            console.error('System metrics update failed:', error);
        }
    }
    
    updatePerformanceChart(metrics) {
        if (!this.charts.performance) return;
        
        const chart = this.charts.performance;
        
        // Update data based on real metrics
        chart.data.datasets[0].data = [
            metrics.networkLatency,
            metrics.cpuUsage,
            metrics.memoryUsage,
            100 - metrics.diskUsage
        ];
        
        chart.update('smooth');
    }
    
    setupWebSocket() {
        // In a real implementation, you would connect to a WebSocket server
        // For demo purposes, we'll simulate WebSocket updates
        
        this.simulateWebSocketUpdates();
    }
    
    simulateWebSocketUpdates() {
        // Simulate real-time notifications
        setInterval(() => {
            if (this.isOnDashboard() && Math.random() > 0.7) {
                this.showRealTimeNotification();
            }
        }, 15000); // Every 15 seconds
    }
    
    showRealTimeNotification() {
        const notifications = [
            'New student enrollment in Khurda district',
            'Attendance marked for 1,250 students in last 5 minutes',
            'System performance optimal - 99.9% uptime',
            '5 new schools added to the system',
            'Monthly report generated successfully'
        ];
        
        const notification = notifications[Math.floor(Math.random() * notifications.length)];
        this.createNotificationToast(notification);
    }
    
    createNotificationToast(message) {
        // Create toast notification element
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">🔔</span>
                <span class="toast-message">${message}</span>
                <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add toast styles
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            padding: 1rem;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
            max-width: 350px;
        `;
        
        // Add CSS for animation
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .toast-content {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .toast-close {
                    background: none;
                    border: none;
                    font-size: 1.2rem;
                    cursor: pointer;
                    color: #64748b;
                    margin-left: auto;
                }
                .toast-close:hover {
                    color: #ef4444;
                }
                .toast-message {
                    flex: 1;
                    font-size: 0.875rem;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }
    
    updateSyncStatus(timestamp) {
        const syncElement = document.getElementById('lastSync');
        if (syncElement) {
            syncElement.textContent = `Last sync: ${timestamp}`;
            syncElement.style.color = '#10b981';
            
            setTimeout(() => {
                syncElement.style.color = '#64748b';
            }, 2000);
        }
    }
    
    isOnDashboard() {
        const activeSection = document.querySelector('.nav-item.active');
        return activeSection && activeSection.dataset.section === 'dashboard';
    }
    
    handleUpdateError(error) {
        console.error('Dashboard update error:', error);
        
        // Show error indicator
        const syncElement = document.getElementById('lastSync');
        if (syncElement) {
            syncElement.textContent = 'Sync failed - Retrying...';
            syncElement.style.color = '#ef4444';
        }
        
        // Retry after 10 seconds
        setTimeout(() => {
            this.updateDashboardData();
        }, 10000);
    }
    
    // Export dashboard data
    exportDashboardData() {
        const data = {
            timestamp: new Date().toISOString(),
            charts: Object.keys(this.charts),
            metrics: this.getSystemMetrics(),
            uptime: this.getUptime()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    getSystemMetrics() {
        return {
            performance: this.charts.performance?.data?.datasets[0]?.data || [],
            lastUpdate: new Date().toISOString(),
            chartsLoaded: Object.keys(this.charts).length
        };
    }
    
    getUptime() {
        const startTime = localStorage.getItem('dashboardStartTime') || Date.now();
        return Date.now() - parseInt(startTime);
    }
    
    // Cleanup method
    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        // Destroy all charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        this.charts = {};
    }
}

// Initialize dashboard manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Store dashboard start time
    if (!localStorage.getItem('dashboardStartTime')) {
        localStorage.setItem('dashboardStartTime', Date.now().toString());
    }
    
    // Initialize dashboard after main app
    setTimeout(() => {
        if (window.app) {
            window.dashboardManager = new DashboardManager(window.app);
            
            // Add export functionality to refresh button (right-click)
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    window.dashboardManager.exportDashboardData();
                });
                
                // Add tooltip
                refreshBtn.title = 'Left-click: Refresh | Right-click: Export Data';
            }
        }
    }, 1000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboardManager) {
        window.dashboardManager.destroy();
    }
});
