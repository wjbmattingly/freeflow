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
    trainBoxLoss: [],
    trainClsLoss: [],
    trainDflLoss: [],
    valBoxLoss: [],
    valClsLoss: [],
    valDflLoss: [],
    map50: [],
    precision: [],
    recall: [],
    lr: []
};

// Store chart data per job ID to preserve history when switching between jobs
let jobChartData = {};

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
    // Disconnect existing socket if present
    if (socket) {
        console.log('🔄 Reconnecting socket...');
        socket.removeAllListeners();
        socket.disconnect();
    }
    
    // Create new socket connection
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
                console.log('📊 Dataset version changed:', { 
                    value: e.target.value, 
                    selectedVersionId 
                });
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
    
    // Get dataset version ID - prioritize dropdown value over pre-selected version
    const dropdownValue = document.getElementById('datasetVersionSelect')?.value;
    let datasetVersionId = null;
    
    if (dropdownValue && dropdownValue !== '') {
        datasetVersionId = parseInt(dropdownValue);
    } else if (selectedVersionId) {
        datasetVersionId = selectedVersionId;
    }
    
    if (!modelName) {
        showToast('Please enter a model name', 'error');
        return;
    }
    
    console.log('🚀 Starting training with config:', { 
        modelName, 
        modelSize, 
        epochs, 
        batchSize, 
        imageSize, 
        datasetVersionId,
        dropdownValue,
        selectedVersionId
    });
    
    try {
        const result = await apiCall(`/api/projects/${PROJECT_ID}/train`, {
            method: 'POST',
            body: JSON.stringify({
                name: modelName,
                model_size: modelSize,
                epochs,
                batch_size: batchSize,
                image_size: imageSize,
                dataset_version_id: datasetVersionId
            })
        });
        
        console.log('✅ Training started:', result);
        
        currentJobId = result.job_id;
        activeJobIds.add(result.job_id);
        
        showToast('Training started! Job #' + result.job_id, 'success');
        
        // Hide training config panel and show monitor
        const trainingContainer = document.querySelector('.training-container');
        const trainingConfig = document.querySelector('.training-config');
        trainingConfig.style.display = 'none';
        trainingContainer.classList.add('monitor-only');
        document.getElementById('trainingCharts').style.display = 'block';
        document.getElementById('newTrainingBtn').style.display = 'block';
        document.getElementById('stopTrainingContainer').style.display = 'block';
        document.getElementById('trainingStatus').innerHTML = `<p>Preparing training for Job #${result.job_id}...</p>`;
        
        // Reinitialize socket connection to ensure clean state
        setupSocketConnection();
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
    document.getElementById('trainBoxLoss').textContent = (data.train_box_loss || 0).toFixed(4);
    document.getElementById('trainClsLoss').textContent = (data.train_cls_loss || 0).toFixed(4);
    document.getElementById('trainDflLoss').textContent = (data.train_dfl_loss || 0).toFixed(4);
    document.getElementById('valBoxLoss').textContent = (data.val_box_loss || 0).toFixed(4);
    document.getElementById('valClsLoss').textContent = (data.val_cls_loss || 0).toFixed(4);
    document.getElementById('map50').textContent = (data.map50 || 0).toFixed(4);
    
    // Update chart data arrays
    chartData.epochs.push(data.epoch);
    chartData.trainBoxLoss.push(data.train_box_loss || 0);
    chartData.trainClsLoss.push(data.train_cls_loss || 0);
    chartData.trainDflLoss.push(data.train_dfl_loss || 0);
    chartData.valBoxLoss.push(data.val_box_loss || 0);
    chartData.valClsLoss.push(data.val_cls_loss || 0);
    chartData.valDflLoss.push(data.val_dfl_loss || 0);
    chartData.map50.push(data.map50 || 0);
    chartData.precision.push(data.precision || 0);
    chartData.recall.push(data.recall || 0);
    chartData.lr.push(data.lr || 0.01);
    
    // Save to job-specific storage to preserve history when switching jobs
    jobChartData[data.job_id] = JSON.parse(JSON.stringify(chartData));
    
    // Update all charts
    updateCharts();
}

function handleTrainingComplete(data) {
    showToast('Training job #' + data.job_id + ' completed!', 'success');
    
    // Hide stop button
    document.getElementById('stopTrainingContainer').style.display = 'none';
    
    document.getElementById('trainingStatus').innerHTML = 
        `<div style="text-align: center;">
            <p style="color: var(--success); font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">✅ Training Complete!</p>
            <p style="color: var(--text-secondary); margin-bottom: 1rem;">Model saved to: ${data.model_path || 'output_models'}</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button class="btn btn-secondary" onclick="showConfigPanel()" style="padding: 0.75rem 2rem; font-size: 1rem;">
                    🎯 Train Another Model
                </button>
                <button class="btn btn-primary" onclick="location.href='/project/${PROJECT_ID}/model/${data.job_id}'" style="padding: 0.75rem 2rem; font-size: 1rem;">
                    📊 View Model Details
                </button>
            </div>
        </div>`;
    
    activeJobIds.delete(data.job_id);
    loadTrainingHistory();
}

function showConfigPanel() {
    const trainingContainer = document.querySelector('.training-container');
    const trainingConfig = document.querySelector('.training-config');
    
    trainingConfig.style.display = 'block';
    trainingContainer.classList.remove('monitor-only');
    document.getElementById('trainingCharts').style.display = 'none';
    document.getElementById('newTrainingBtn').style.display = 'none';
    currentJobId = null;
    
    // Clear the form
    document.getElementById('modelName').value = '';
    
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

function initializeCharts(preserveData = false) {
    // Save current data if we want to preserve it
    const savedData = preserveData ? JSON.parse(JSON.stringify(chartData)) : null;
    
    // Clear existing data
    chartData = {
        epochs: [],
        trainBoxLoss: [],
        trainClsLoss: [],
        trainDflLoss: [],
        valBoxLoss: [],
        valClsLoss: [],
        valDflLoss: [],
        map50: [],
        precision: [],
        recall: [],
        lr: []
    };
    
    // Restore data if preserving
    if (preserveData && savedData) {
        chartData = savedData;
    }
    
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
    
    // Loss Chart (showing detailed loss components)
    const lossCtx = document.getElementById('lossChart').getContext('2d');
    lossChart = new Chart(lossCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Box Loss',
                    data: [],
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                },
                {
                    label: 'Class Loss',
                    data: [],
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                },
                {
                    label: 'DFL Loss',
                    data: [],
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2
                },
                {
                    label: 'Val Box Loss',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 1,
                    tension: 0.4,
                    pointRadius: 1,
                    borderDash: [5, 5]
                },
                {
                    label: 'Val Class Loss',
                    data: [],
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 1,
                    tension: 0.4,
                    pointRadius: 1,
                    borderDash: [5, 5]
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
        { chart: lossChart, data: [chartData.trainBoxLoss, chartData.trainClsLoss, chartData.trainDflLoss, chartData.valBoxLoss, chartData.valClsLoss] },
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
                    <button 
                        onclick="event.stopPropagation(); deleteTrainingJob(${job.id}, ${isRunning})" 
                        style="position: absolute; top: 1rem; right: 1rem; background: var(--error); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;"
                        title="${isRunning ? 'Cancel training' : 'Delete job'}">
                        ${isRunning ? '⏹️' : '🗑️'}
                    </button>
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
        
        // Show monitor panel, hide config panel
        const trainingContainer = document.querySelector('.training-container');
        const trainingConfig = document.querySelector('.training-config');
        trainingConfig.style.display = 'none';
        trainingContainer.classList.add('monitor-only');
        document.getElementById('trainingCharts').style.display = 'block';
        document.getElementById('newTrainingBtn').style.display = 'block';
        
        // Update UI to show this job's info
        const statusText = job.status === 'completed' ? '✅ Completed' : 
                          job.status === 'training' ? '⏳ Training' : 
                          job.status === 'failed' ? '❌ Failed' : '⏸️ Pending';
        document.getElementById('trainingStatus').innerHTML = `<p>Viewing Job #${jobId} (${job.name || 'Unnamed'}) - ${statusText}</p>`;
        
        // Show/hide stop button based on job status
        const stopContainer = document.getElementById('stopTrainingContainer');
        if (job.status === 'training') {
            stopContainer.style.display = 'block';
            // Reset button state
            const stopBtn = document.getElementById('stopTrainingBtn');
            stopBtn.disabled = false;
            stopBtn.textContent = '⏹️ Stop After Current Epoch';
            stopBtn.style.opacity = '1';
        } else {
            stopContainer.style.display = 'none';
        }
        
        // If job is completed or failed, load its metrics
        if ((job.status === 'completed' || job.status === 'failed') && job.metrics) {
            displayJobMetrics(job.metrics);
            showToast('Viewing completed job #' + jobId, 'info');
        } 
        // If job is still running, restore chart data if we have it, otherwise initialize fresh
        else if (job.status === 'training' || job.status === 'pending') {
            // Check if we have saved chart data for this job
            if (jobChartData[jobId]) {
                // Restore the saved chart data BEFORE initializing charts
                chartData = JSON.parse(JSON.stringify(jobChartData[jobId]));
                // Reinitialize charts while preserving the data
                initializeCharts(true);
                // Update charts to show the restored data
                updateCharts();
                
                // Update metric cards with latest values
                if (chartData.epochs.length > 0) {
                    const lastIdx = chartData.epochs.length - 1;
                    document.getElementById('currentEpoch').textContent = `${chartData.epochs[lastIdx]} / ?`;
                    document.getElementById('trainBoxLoss').textContent = (chartData.trainBoxLoss[lastIdx] || 0).toFixed(4);
                    document.getElementById('trainClsLoss').textContent = (chartData.trainClsLoss[lastIdx] || 0).toFixed(4);
                    document.getElementById('trainDflLoss').textContent = (chartData.trainDflLoss[lastIdx] || 0).toFixed(4);
                    document.getElementById('valBoxLoss').textContent = (chartData.valBoxLoss[lastIdx] || 0).toFixed(4);
                    document.getElementById('valClsLoss').textContent = (chartData.valClsLoss[lastIdx] || 0).toFixed(4);
                    document.getElementById('map50').textContent = (chartData.map50[lastIdx] || 0).toFixed(4);
                }
                
                showToast('Resumed viewing live job #' + jobId + ' with ' + chartData.epochs.length + ' epochs', 'info');
            } else {
                // Initialize fresh charts for first-time viewing
                initializeCharts(false);
                showToast('Now viewing live job #' + jobId, 'info');
            }
            // Reconnect socket to ensure we receive updates for this job
            setupSocketConnection();
        }
        
        // Reload history to update active indicator
        await loadTrainingHistory();
        
    } catch (error) {
        showToast('Failed to load job details', 'error');
        console.error('Error loading job:', error);
    }
}

function displayJobMetrics(metrics) {
    // Reset charts
    initializeCharts();
    
    // Parse metrics if it's a string
    const metricsData = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
    
    // Check if we have epochs array with data
    if (metricsData.epochs && Array.isArray(metricsData.epochs) && metricsData.epochs.length > 0) {
        // Populate chartData arrays
        metricsData.epochs.forEach((epoch, index) => {
            chartData.epochs.push(index + 1);
        });
        
        // Map different metric formats
        if (metricsData.train_loss && Array.isArray(metricsData.train_loss)) {
            // Format: separate arrays for each metric
            chartData.trainBoxLoss = [...metricsData.train_loss];
            chartData.valBoxLoss = [...metricsData.val_loss];
            chartData.map50 = [...metricsData.map50];
            // Fill in zeros for losses we don't have
            chartData.trainClsLoss = new Array(metricsData.train_loss.length).fill(0);
            chartData.trainDflLoss = new Array(metricsData.train_loss.length).fill(0);
            chartData.valClsLoss = new Array(metricsData.train_loss.length).fill(0);
            chartData.valDflLoss = new Array(metricsData.train_loss.length).fill(0);
            chartData.precision = new Array(metricsData.train_loss.length).fill(0);
            chartData.recall = new Array(metricsData.train_loss.length).fill(0);
            chartData.lr = new Array(metricsData.train_loss.length).fill(0.01);
        }
        
        updateCharts();
        
        // Update metric cards with final values
        const lastEpoch = chartData.epochs.length;
        if (lastEpoch > 0) {
            document.getElementById('currentEpoch').textContent = `${lastEpoch} / ${lastEpoch}`;
            document.getElementById('trainBoxLoss').textContent = (chartData.trainBoxLoss[lastEpoch - 1] || 0).toFixed(4);
            document.getElementById('trainClsLoss').textContent = (chartData.trainClsLoss[lastEpoch - 1] || 0).toFixed(4);
            document.getElementById('trainDflLoss').textContent = (chartData.trainDflLoss[lastEpoch - 1] || 0).toFixed(4);
            document.getElementById('valBoxLoss').textContent = (chartData.valBoxLoss[lastEpoch - 1] || 0).toFixed(4);
            document.getElementById('valClsLoss').textContent = (chartData.valClsLoss[lastEpoch - 1] || 0).toFixed(4);
            document.getElementById('map50').textContent = (chartData.map50[lastEpoch - 1] || 0).toFixed(4);
        }
    } else {
        showToast('No detailed metrics available for this training job', 'info');
    }
}

async function stopTrainingEarly() {
    if (!currentJobId) {
        showToast('No active training job', 'error');
        return;
    }
    
    if (!confirm('Stop training after the current epoch? The model will be saved with the progress so far.')) {
        return;
    }
    
    try {
        const stopBtn = document.getElementById('stopTrainingBtn');
        stopBtn.disabled = true;
        stopBtn.textContent = '⏳ Stopping...';
        stopBtn.style.opacity = '0.6';
        
        await apiCall(`/api/training/${currentJobId}/stop`, {
            method: 'POST'
        });
        
        showToast('Early stop requested. Training will finish current epoch...', 'info');
        
        // Button will be hidden when training completes
    } catch (error) {
        showToast(error.message || 'Failed to stop training', 'error');
        // Re-enable button on error
        const stopBtn = document.getElementById('stopTrainingBtn');
        stopBtn.disabled = false;
        stopBtn.textContent = '⏹️ Stop After Current Epoch';
        stopBtn.style.opacity = '1';
    }
}

async function deleteTrainingJob(jobId, isRunning) {
    const action = isRunning ? 'cancel' : 'delete';
    const message = isRunning 
        ? `Cancel training job #${jobId}? The job will be stopped.`
        : `Delete training job #${jobId}? This cannot be undone.`;
    
    if (!confirm(message)) {
        return;
    }
    
    try {
        const result = await apiCall(`/api/training/${jobId}`, {
            method: 'DELETE'
        });
        
        const successMessage = result.cancelled 
            ? 'Training job cancelled'
            : 'Training job deleted';
        showToast(successMessage, 'success');
        
        // Clean up stored chart data
        if (jobChartData[jobId]) {
            delete jobChartData[jobId];
        }
        
        // If we were viewing this job, show config panel
        if (currentJobId === jobId) {
            currentJobId = null;
            activeJobIds.delete(jobId);
            showConfigPanel();
        }
        
        await loadTrainingHistory();
        
    } catch (error) {
        showToast(error.message || 'Failed to delete training job', 'error');
    }
}

