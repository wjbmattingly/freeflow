// Training page functionality

let socket;
let currentJobId = null;
let activeJobIds = new Set(); // Track all active/viewing jobs
let lossChart = null;
let mapChart = null;
let precisionRecallChart = null;
let lrChart = null;
let datasetVersions = [];
let selectedVersionId = null;
let trainingJobs = [];
let chartData = {
    epochs: [],
    trainLoss: [],
    valLoss: [],
    map50: [],
    precision: [],
    recall: [],
    lr: []
};

document.addEventListener('DOMContentLoaded', () => {
    loadProjectInfo();
    setupSocketConnection();
    loadTrainingHistory();
    loadDatasetVersions();
    
    // Check if version is pre-selected from URL
    const urlParams = new URLSearchParams(window.location.search);
    const versionParam = urlParams.get('version');
    if (versionParam) {
        selectedVersionId = parseInt(versionParam);
    }
    
    // Refresh training history every 5 seconds to show new jobs and status updates
    setInterval(() => {
        loadTrainingHistory();
    }, 5000);
});

async function loadProjectInfo() {
    try {
        const project = await apiCall(`/api/projects/${PROJECT_ID}`);
        
        document.getElementById('totalImages').textContent = project.image_count;
        document.getElementById('annotatedImages').textContent = project.annotated_count;
        document.getElementById('classCount').textContent = project.classes.length;
        
    } catch (error) {
        showToast('Failed to load project info', 'error');
    }
}

function setupSocketConnection() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Socket connected');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
    });
    
    socket.on('training_update', (data) => {
        console.log('📨 Training update:', data);
        if (data.job_id === currentJobId) {
            updateTrainingStatus(data.message);
        }
    });
    
    socket.on('training_progress', (data) => {
        console.log('📊 Training progress:', data);
        if (data.job_id === currentJobId) {
            updateTrainingProgress(data);
        }
    });
    
    socket.on('training_complete', (data) => {
        console.log('✅ Training complete:', data);
        if (data.job_id === currentJobId) {
            handleTrainingComplete(data);
        }
    });
    
    socket.on('training_error', (data) => {
        console.error('❌ Training error:', data);
        if (data.job_id === currentJobId) {
            handleTrainingError(data);
        }
    });
}

async function loadDatasetVersions() {
    try {
        datasetVersions = await apiCall(`/api/projects/${PROJECT_ID}/dataset-versions`);
        
        const versionSelect = document.getElementById('datasetVersionSelect');
        if (versionSelect) {
            versionSelect.innerHTML = '<option value="">Use all annotated images (auto-split 70/20/10)</option>' +
                datasetVersions.map(v => `
                    <option value="${v.id}" ${selectedVersionId === v.id ? 'selected' : ''}>
                        ${v.name} - Train: ${v.train_count} | Val: ${v.val_count} | Test: ${v.test_count}
                    </option>
                `).join('');
                
            versionSelect.addEventListener('change', (e) => {
                selectedVersionId = e.target.value ? parseInt(e.target.value) : null;
            });
        }
    } catch (error) {
        console.error('Failed to load dataset versions:', error);
    }
}

async function startTraining() {
    const modelName = document.getElementById('modelName').value.trim();
    const modelSize = document.getElementById('modelSize').value;
    const epochs = parseInt(document.getElementById('epochs').value);
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const imageSize = parseInt(document.getElementById('imageSize').value);
    const datasetVersionId = selectedVersionId || document.getElementById('datasetVersionSelect')?.value || null;
    
    if (!modelName) {
        showToast('Please enter a model name', 'error');
        return;
    }
    
    console.log('🚀 Starting training with config:', { modelName, modelSize, epochs, batchSize, imageSize, datasetVersionId });
    
    try {
        const result = await apiCall(`/api/projects/${PROJECT_ID}/train`, {
            method: 'POST',
            body: JSON.stringify({
                name: modelName,
                model_size: modelSize,
                epochs,
                batch_size: batchSize,
                image_size: imageSize,
                dataset_version_id: datasetVersionId ? parseInt(datasetVersionId) : null
            })
        });
        
        console.log('✅ Training started:', result);
        
        currentJobId = result.job_id;
        activeJobIds.add(result.job_id);
        
        showToast('Training started! Job #' + result.job_id, 'success');
        
        // Don't disable the button - allow multiple training jobs
        document.getElementById('trainingCharts').style.display = 'block';
        document.getElementById('trainingStatus').innerHTML = `<p>Preparing training for Job #${result.job_id}...</p>`;
        
        initializeCharts();
        
        // Reload training history to show new job
        await loadTrainingHistory();
        
    } catch (error) {
        console.error('❌ Failed to start training:', error);
        showToast('Failed to start training: ' + (error.message || 'Unknown error'), 'error');
    }
}

function updateTrainingStatus(message) {
    document.getElementById('trainingStatus').innerHTML = `<p>${message}</p>`;
}

function updateTrainingProgress(data) {
    document.getElementById('currentEpoch').textContent = 
        `${data.epoch} / ${data.total_epochs}`;
    document.getElementById('trainLoss').textContent = data.train_loss.toFixed(4);
    document.getElementById('valLoss').textContent = data.val_loss.toFixed(4);
    document.getElementById('map50').textContent = (data.map50 || 0).toFixed(4);
    
    // Update chart data arrays
    chartData.epochs.push(data.epoch);
    chartData.trainLoss.push(data.train_loss);
    chartData.valLoss.push(data.val_loss);
    chartData.map50.push(data.map50 || 0);
    chartData.precision.push(data.precision || 0);
    chartData.recall.push(data.recall || 0);
    chartData.lr.push(data.lr || 0.01);
    
    // Update all charts
    updateCharts();
}

function handleTrainingComplete(data) {
    showToast('Training job #' + data.job_id + ' completed!', 'success');
    document.getElementById('trainingStatus').innerHTML = 
        `<p style="color: var(--success);">✅ Training complete! (Job #${data.job_id})</p>
         <p>Model saved to: ${data.model_path || 'output_models'}</p>`;
    
    activeJobIds.delete(data.job_id);
    loadTrainingHistory();
}

function handleTrainingError(data) {
    showToast('Training job #' + data.job_id + ' failed', 'error');
    document.getElementById('trainingStatus').innerHTML = 
        `<p style="color: var(--error);">❌ Training failed (Job #${data.job_id})</p>
         <p>${data.error}</p>`;
    
    activeJobIds.delete(data.job_id);
    loadTrainingHistory();
}

function initializeCharts() {
    // Clear existing data
    chartData = {
        epochs: [],
        trainLoss: [],
        valLoss: [],
        map50: [],
        precision: [],
        recall: [],
        lr: []
    };
    
    // Destroy existing charts
    if (lossChart) lossChart.destroy();
    if (mapChart) mapChart.destroy();
    if (precisionRecallChart) precisionRecallChart.destroy();
    if (lrChart) lrChart.destroy();
    
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        animation: {
            duration: 0 // Disable animations for performance
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#94a3b8',
                    font: {
                        size: 11
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
            },
            y: {
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(148, 163, 184, 0.1)' }
            }
        }
    };
    
    // Loss Chart
    const lossCtx = document.getElementById('lossChart').getContext('2d');
    lossChart = new Chart(lossCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Train Loss',
                    data: [],
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                },
                {
                    label: 'Val Loss',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    beginAtZero: false
                }
            }
        }
    });
    
    // mAP Chart
    const mapCtx = document.getElementById('mapChart').getContext('2d');
    mapChart = new Chart(mapCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'mAP@50',
                    data: [],
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2,
                    fill: true
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    beginAtZero: true,
                    max: 1
                }
            }
        }
    });
    
    // Precision & Recall Chart
    const prCtx = document.getElementById('precisionRecallChart').getContext('2d');
    precisionRecallChart = new Chart(prCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Precision',
                    data: [],
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                },
                {
                    label: 'Recall',
                    data: [],
                    borderColor: '#EC4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    beginAtZero: true,
                    max: 1
                }
            }
        }
    });
    
    // Learning Rate Chart
    const lrCtx = document.getElementById('lrChart').getContext('2d');
    lrChart = new Chart(lrCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Learning Rate',
                    data: [],
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2,
                    fill: true
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    beginAtZero: true,
                    type: 'logarithmic'
                }
            }
        }
    });
}

function updateCharts() {
    if (!lossChart || !mapChart || !precisionRecallChart || !lrChart) return;
    
    // Update all charts with current data
    const charts = [
        { chart: lossChart, data: [chartData.trainLoss, chartData.valLoss] },
        { chart: mapChart, data: [chartData.map50] },
        { chart: precisionRecallChart, data: [chartData.precision, chartData.recall] },
        { chart: lrChart, data: [chartData.lr] }
    ];
    
    charts.forEach(({ chart, data }) => {
        chart.data.labels = chartData.epochs;
        data.forEach((dataset, idx) => {
            chart.data.datasets[idx].data = dataset;
        });
        chart.update('none'); // 'none' mode for better performance
    });
}

async function loadTrainingHistory() {
    try {
        const response = await apiCall(`/api/projects/${PROJECT_ID}`);
        trainingJobs = response.training_jobs || [];
        
        const historyDiv = document.getElementById('trainingHistory');
        
        if (trainingJobs.length === 0) {
            historyDiv.innerHTML = '<p class="empty-state">No training jobs yet. Start your first training!</p>';
            return;
        }
        
        historyDiv.innerHTML = trainingJobs.map(job => {
            const statusClass = job.status === 'completed' ? 'success' : 
                               job.status === 'failed' ? 'error' : 
                               job.status === 'training' ? 'warning' : 'secondary';
            const statusIcon = job.status === 'completed' ? '✅' : 
                              job.status === 'failed' ? '❌' : 
                              job.status === 'training' ? '⏳' : '⏸️';
            
            const isActive = job.id === currentJobId;
            const isRunning = job.status === 'training' || job.status === 'pending';
            
            const modelSizeLabel = {
                'n': 'Nano',
                's': 'Small',
                'm': 'Medium',
                'l': 'Large',
                'x': 'X-Large'
            }[job.model_size || 'n'];
            
            return `
                <div class="history-item ${isActive ? 'active' : ''}" style="position: relative;">
                    <div onclick="viewTrainingJob(${job.id})" style="cursor: pointer;">
                        <div class="history-header">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="status-badge ${statusClass}">${statusIcon} ${job.status}</span>
                                <span style="font-weight: 600;">${job.name || `Job #${job.id}`}</span>
                                ${isRunning ? '<span style="color: var(--warning); font-size: 0.75rem;">● LIVE</span>' : ''}
                            </div>
                            <span class="history-date">${new Date(job.created_at).toLocaleString()}</span>
                        </div>
                        <div class="history-details">
                            <span>📏 ${modelSizeLabel}</span>
                            <span>🔁 ${job.epochs} epochs</span>
                            <span>📦 Batch ${job.batch_size}</span>
                            <span>🖼️ ${job.image_size}px</span>
                            ${job.dataset_version_id ? '<span>📌 Versioned</span>' : '<span>🔀 Auto-split</span>'}
                        </div>
                        ${isActive ? '<div style="margin-top: 0.5rem; color: var(--primary-color); font-size: 0.75rem;">👁️ Currently viewing</div>' : ''}
                    </div>
                    ${!isRunning ? `
                        <button 
                            onclick="event.stopPropagation(); deleteTrainingJob(${job.id})" 
                            style="position: absolute; top: 1rem; right: 1rem; background: var(--error); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;"
                            title="Delete job">
                            🗑️
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Failed to load training history:', error);
    }
}

async function viewTrainingJob(jobId) {
    currentJobId = jobId;
    activeJobIds.add(jobId);
    
    try {
        const job = await apiCall(`/api/training/${jobId}`);
        
        // Update UI to show this job's info
        document.getElementById('trainingCharts').style.display = 'block';
        document.getElementById('trainingStatus').innerHTML = `<p>Viewing Job #${jobId} - ${job.status}</p>`;
        
        // If job is completed or failed, load its metrics
        if (job.metrics) {
            const metrics = JSON.parse(job.metrics);
            displayJobMetrics(metrics);
        }
        
        // If job is still running, charts will update via socket
        if (job.status === 'training' || job.status === 'pending') {
            initializeCharts();
            showToast('Now viewing live job #' + jobId, 'info');
        } else {
            showToast('Viewing completed job #' + jobId, 'info');
        }
        
        // Reload history to update active indicator
        await loadTrainingHistory();
        
    } catch (error) {
        showToast('Failed to load job details', 'error');
    }
}

function displayJobMetrics(metrics) {
    // Reset charts
    initializeCharts();
    
    // If we have epoch-by-epoch data
    if (metrics.epochs) {
        metrics.epochs.forEach(epoch => {
            chartData.epochs.push(epoch.epoch);
            chartData.trainLoss.push(epoch.train_loss);
            chartData.valLoss.push(epoch.val_loss);
            chartData.map50.push(epoch.map50 || 0);
            chartData.precision.push(epoch.precision || 0);
            chartData.recall.push(epoch.recall || 0);
            chartData.lr.push(epoch.lr || 0.01);
        });
        
        updateCharts();
        
        // Update final metrics
        const lastEpoch = metrics.epochs[metrics.epochs.length - 1];
        if (lastEpoch) {
            document.getElementById('currentEpoch').textContent = `${lastEpoch.epoch} / ${lastEpoch.epoch}`;
            document.getElementById('trainLoss').textContent = lastEpoch.train_loss.toFixed(4);
            document.getElementById('valLoss').textContent = lastEpoch.val_loss.toFixed(4);
            document.getElementById('map50').textContent = (lastEpoch.map50 || 0).toFixed(4);
        }
    }
}

async function deleteTrainingJob(jobId) {
    if (!confirm(`Delete training job #${jobId}? This cannot be undone.`)) {
        return;
    }
    
    try {
        await apiCall(`/api/training/${jobId}`, {
            method: 'DELETE'
        });
        
        showToast('Training job deleted', 'success');
        
        // If we were viewing this job, clear the charts
        if (currentJobId === jobId) {
            currentJobId = null;
            document.getElementById('trainingCharts').style.display = 'none';
            document.getElementById('trainingStatus').innerHTML = '<p class="empty-state">No training in progress</p>';
        }
        
        await loadTrainingHistory();
        
    } catch (error) {
        showToast(error.message || 'Failed to delete training job', 'error');
    }
}

