// Model View Page Functionality

let performanceChart, boxLossChart, classLossChart, dflLossChart;
let previewCanvas, previewCtx;
let currentTestImage = null;
let projectClasses = {}; // Map of class_id -> {name, color}

document.addEventListener('DOMContentLoaded', () => {
    previewCanvas = document.getElementById('previewCanvas');
    previewCtx = previewCanvas.getContext('2d');
    
    loadProjectClasses();
    loadModelData();
    initializeCharts();
});

// Make reEvaluateModel available globally for onclick handler
window.reEvaluateModel = reEvaluateModel;

async function loadProjectClasses() {
    try {
        const classes = await apiCall(`/api/projects/${PROJECT_ID}/classes`);
        // Create a map of class_id -> {name, color}
        classes.forEach(cls => {
            projectClasses[cls.id] = {
                name: cls.name,
                color: cls.color
            };
        });
        console.log('Loaded project classes:', projectClasses);
    } catch (error) {
        console.error('Failed to load project classes:', error);
    }
}

async function reEvaluateModel() {
    const btn = document.getElementById('reEvaluateBtn');
    const originalText = btn.textContent;
    
    try {
        btn.disabled = true;
        btn.textContent = '⏳ Evaluating...';
        
        showToast('Running evaluation on test set...', 'info');
        
        const result = await apiCall(`/api/training/${MODEL_ID}/evaluate`, {
            method: 'POST'
        });
        
        if (result.test_metrics) {
            // Update metrics display
            document.getElementById('test_map50').textContent = (result.test_metrics.map50 * 100).toFixed(1) + '%';
            document.getElementById('test_precision').textContent = (result.test_metrics.precision * 100).toFixed(1) + '%';
            document.getElementById('test_recall').textContent = (result.test_metrics.recall * 100).toFixed(1) + '%';
            
            // Reload class metrics
            if (result.class_metrics) {
                loadClassPrecision();
            }
            
            showToast('✅ Model re-evaluated successfully!', 'success');
        }
    } catch (error) {
        console.error('Failed to evaluate model:', error);
        showToast('Evaluation failed: ' + (error.error || error.message || 'Unknown error'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function loadModelData() {
    try {
        let model = await apiCall(`/api/training/${MODEL_ID}`);
        
        // Check if test metrics are missing and evaluate if needed
        if (model.test_map50 === null || model.test_map50 === undefined || isNaN(model.test_map50)) {
            console.log('Test metrics missing, auto-evaluating model...');
            showToast('Evaluating model on test set...', 'info');
            
            try {
                const evalResult = await apiCall(`/api/training/${MODEL_ID}/evaluate`, {
                    method: 'POST'
                });
                
                if (evalResult.test_metrics) {
                    // Update model object with new metrics
                    model.test_map50 = evalResult.test_metrics.map50;
                    model.test_precision = evalResult.test_metrics.precision;
                    model.test_recall = evalResult.test_metrics.recall;
                    showToast('Model evaluated successfully!', 'success');
                }
            } catch (evalError) {
                console.error('Failed to evaluate model:', evalError);
                showToast('Could not evaluate model on test set', 'warning');
            }
        }
        
        // Update metrics display
        if (model.test_map50 !== null && model.test_map50 !== undefined && !isNaN(model.test_map50)) {
            document.getElementById('test_map50').textContent = (model.test_map50 * 100).toFixed(1) + '%';
            document.getElementById('test_precision').textContent = (model.test_precision * 100).toFixed(1) + '%';
            document.getElementById('test_recall').textContent = (model.test_recall * 100).toFixed(1) + '%';
        } else {
            document.getElementById('test_map50').textContent = 'N/A';
            document.getElementById('test_precision').textContent = 'N/A';
            document.getElementById('test_recall').textContent = 'N/A';
        }
        
        // Load training metrics
        if (model.metrics) {
            const metrics = typeof model.metrics === 'string' ? JSON.parse(model.metrics) : model.metrics;
            updateCharts(metrics);
        }
        
        // Load confusion matrices
        loadConfusionMatrices();
        
        // Load test samples
        loadTestSamples();
        
        // Load per-class precision
        loadClassPrecision();
        
    } catch (error) {
        console.error('Failed to load model data:', error);
        showToast('Failed to load model data', 'error');
    }
}

function initializeCharts() {
    // Performance Chart
    performanceChart = new Chart(document.getElementById('performanceChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'mAP',
                    data: [],
                    borderColor: 'rgb(124, 58, 237)',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'mAP50-95',
                    data: [],
                    borderColor: 'rgba(124, 58, 237, 0.5)',
                    backgroundColor: 'rgba(124, 58, 237, 0.05)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, max: 1 }
            }
        }
    });
    
    // Box Loss Chart
    boxLossChart = new Chart(document.getElementById('boxLossChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Box Loss',
                data: [],
                borderColor: 'rgb(124, 58, 237)',
                backgroundColor: 'rgba(124, 58, 237, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
    
    // Class Loss Chart
    classLossChart = new Chart(document.getElementById('classLossChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Class Loss',
                data: [],
                borderColor: 'rgb(124, 58, 237)',
                backgroundColor: 'rgba(124, 58, 237, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
    
    // DFL Loss Chart
    dflLossChart = new Chart(document.getElementById('dflLossChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'DFL Loss',
                data: [],
                borderColor: 'rgb(124, 58, 237)',
                backgroundColor: 'rgba(124, 58, 237, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function updateCharts(metrics) {
    if (!metrics.epochs || metrics.epochs.length === 0) return;
    
    // Update performance chart
    performanceChart.data.labels = metrics.epochs;
    performanceChart.data.datasets[0].data = metrics.map50 || metrics.map50_95 || [];
    performanceChart.data.datasets[1].data = metrics.map50_95 || [];
    performanceChart.update();
    
    // Update loss charts
    boxLossChart.data.labels = metrics.epochs;
    boxLossChart.data.datasets[0].data = metrics.train_loss || [];
    boxLossChart.update();
    
    classLossChart.data.labels = metrics.epochs;
    classLossChart.data.datasets[0].data = metrics.val_loss || [];
    classLossChart.update();
    
    dflLossChart.data.labels = metrics.epochs;
    dflLossChart.data.datasets[0].data = metrics.val_loss || metrics.train_loss || [];
    dflLossChart.update();
}

async function loadConfusionMatrices() {
    try {
        // Try to load confusion matrices from training output
        const jobDir = MODEL_PATH.substring(0, MODEL_PATH.lastIndexOf('/weights'));
        
        document.getElementById('confusionMatrix').src = `/api/training/${MODEL_ID}/confusion-matrix`;
        document.getElementById('confusionMatrixNormalized').src = `/api/training/${MODEL_ID}/confusion-matrix-normalized`;
        
        // Handle image load errors
        document.getElementById('confusionMatrix').onerror = function() {
            this.parentElement.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Confusion matrix not available</p>';
        };
        document.getElementById('confusionMatrixNormalized').onerror = function() {
            this.parentElement.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Normalized confusion matrix not available</p>';
        };
    } catch (error) {
        console.error('Failed to load confusion matrices:', error);
    }
}

async function loadTestSamples() {
    try {
        // Get test set images
        const data = await apiCall(`/api/projects/${PROJECT_ID}/images`);
        const allImages = [];
        data.batches.forEach(batch => {
            allImages.push(...batch.images);
        });
        
        // Take first 5 images as samples
        const samples = allImages.slice(0, 5);
        
        const samplesHtml = samples.map(img => `
            <img src="/api/images/${img.id}" 
                 onclick="testModelOnSample(${img.id})"
                 style="width: 100%; cursor: pointer; border: 2px solid var(--border); border-radius: 0.375rem; transition: border-color 0.2s;"
                 onmouseover="this.style.borderColor='var(--primary-color)'"
                 onmouseout="this.style.borderColor='var(--border)'">
        `).join('');
        
        document.getElementById('testSamples').innerHTML = samplesHtml;
    } catch (error) {
        console.error('Failed to load test samples:', error);
    }
}

async function loadClassPrecision() {
    try {
        // Get model data to fetch per-class metrics
        const model = await apiCall(`/api/training/${MODEL_ID}`);
        
        if (model.class_metrics && model.class_metrics.length > 0) {
            // Use actual per-class metrics
            const barsHtml = model.class_metrics.map(cls => {
                // Use precision for the bar display (you could also use map50 or recall)
                const precision = cls.precision || 0;
                const percentage = (precision * 100).toFixed(1);
                
                return `
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
                        <div style="width: 120px; font-size: 0.875rem; font-weight: 500;">${cls.class}</div>
                        <div style="flex: 1; background: var(--hover); height: 24px; border-radius: 12px; position: relative; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, rgb(124, 58, 237) 0%, rgba(124, 58, 237, 0.7) 100%); height: 100%; width: ${percentage}%; border-radius: 12px; transition: width 0.3s ease;"></div>
                        </div>
                        <div style="width: 80px; text-align: right; font-size: 0.875rem;">
                            <div style="font-weight: 500;">${percentage}%</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">P: ${(cls.precision * 100).toFixed(1)}% R: ${(cls.recall * 100).toFixed(1)}%</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            document.getElementById('classPrecisionBars').innerHTML = barsHtml;
        } else {
            // Fallback: show project classes with N/A
            const classes = await apiCall(`/api/projects/${PROJECT_ID}/classes`);
            const barsHtml = classes.map(cls => `
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
                    <div style="width: 120px; font-size: 0.875rem; font-weight: 500;">${cls.name}</div>
                    <div style="flex: 1; background: var(--hover); height: 24px; border-radius: 12px; position: relative; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, rgba(124, 58, 237, 0.3) 0%, rgba(124, 58, 237, 0.2) 100%); height: 100%; width: 0%; border-radius: 12px;"></div>
                    </div>
                    <div style="width: 80px; text-align: right; font-size: 0.875rem; color: var(--text-secondary);">N/A</div>
                </div>
            `).join('');
            
            document.getElementById('classPrecisionBars').innerHTML = barsHtml;
        }
    } catch (error) {
        console.error('Failed to load class precision:', error);
    }
}

async function testModelOnSample(imageId) {
    try {
        document.getElementById('previewPlaceholder').style.display = 'none';
        
        const confidence = document.getElementById('confidenceThreshold').value / 100;
        
        // Run prediction
        const result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
            method: 'POST',
            body: JSON.stringify({
                image_id: imageId,
                confidence: confidence,
                model_path: MODEL_PATH
            })
        });
        
        // Load and display image with predictions
        const img = new Image();
        img.onload = function() {
            previewCanvas.width = img.width;
            previewCanvas.height = img.height;
            previewCtx.drawImage(img, 0, 0);
            
            // Draw predictions with class names
            if (result.predictions && result.predictions.length > 0) {
                drawPredictionsWithClasses(result.predictions, img.width, img.height);
                showToast(`Detected ${result.predictions.length} objects`, 'success');
            } else {
                showToast('No objects detected', 'info');
            }
        };
        img.src = `/api/images/${imageId}`;
        
    } catch (error) {
        console.error('Prediction failed:', error);
        showToast('Prediction failed', 'error');
    }
}

async function testModelOnImage(file) {
    if (!file) return;
    
    try {
        document.getElementById('previewPlaceholder').style.display = 'none';
        
        showToast('Running prediction on uploaded image...', 'info');
        
        // Get confidence threshold
        const confidence = document.getElementById('confidenceThreshold').value / 100;
        
        // Create FormData to upload file
        const formData = new FormData();
        formData.append('file', file);
        formData.append('confidence', confidence);
        
        // Upload and predict
        const response = await fetch(`/api/training/${MODEL_ID}/predict-upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Load and display image with predictions
        const img = new Image();
        img.onload = function() {
            previewCanvas.width = img.width;
            previewCanvas.height = img.height;
            previewCtx.drawImage(img, 0, 0);
            
            // Draw predictions
            if (result.predictions && result.predictions.length > 0) {
                drawPredictionsWithClasses(result.predictions, img.width, img.height);
                showToast(`Detected ${result.predictions.length} objects`, 'success');
            } else {
                showToast('No objects detected', 'info');
            }
        };
        img.src = URL.createObjectURL(file);
        
    } catch (error) {
        console.error('Failed to run prediction:', error);
        showToast('Prediction failed', 'error');
    }
}

function drawPredictions(predictions, imgWidth, imgHeight) {
    predictions.forEach(pred => {
        const x = (pred.x_center - pred.width / 2) * imgWidth;
        const y = (pred.y_center - pred.height / 2) * imgHeight;
        const w = pred.width * imgWidth;
        const h = pred.height * imgHeight;
        
        // Draw box
        previewCtx.strokeStyle = '#7C3AED';
        previewCtx.lineWidth = 3;
        previewCtx.strokeRect(x, y, w, h);
        
        // Draw label background
        const label = `${pred.confidence.toFixed(2)}`;
        previewCtx.font = '16px sans-serif';
        const textWidth = previewCtx.measureText(label).width;
        previewCtx.fillStyle = '#7C3AED';
        previewCtx.fillRect(x, y - 25, textWidth + 10, 25);
        
        // Draw label text
        previewCtx.fillStyle = 'white';
        previewCtx.fillText(label, x + 5, y - 7);
    });
}

function drawPredictionsWithClasses(predictions, imgWidth, imgHeight) {
    predictions.forEach(pred => {
        const x = (pred.x_center - pred.width / 2) * imgWidth;
        const y = (pred.y_center - pred.height / 2) * imgHeight;
        const w = pred.width * imgWidth;
        const h = pred.height * imgHeight;
        
        // Get class color from project classes, fallback to purple
        const classInfo = projectClasses[pred.class_id];
        const color = classInfo ? classInfo.color : '#7C3AED';
        const className = pred.class_name || (classInfo ? classInfo.name : 'Object');
        
        // Draw box
        previewCtx.strokeStyle = color;
        previewCtx.lineWidth = 3;
        previewCtx.strokeRect(x, y, w, h);
        
        // Draw label with class name and confidence
        const label = `${className} ${(pred.confidence * 100).toFixed(0)}%`;
        previewCtx.font = '16px sans-serif';
        const textWidth = previewCtx.measureText(label).width;
        previewCtx.fillStyle = color;
        previewCtx.fillRect(x, y - 25, textWidth + 10, 25);
        
        // Draw label text
        previewCtx.fillStyle = 'white';
        previewCtx.fillText(label, x + 5, y - 7);
    });
}

