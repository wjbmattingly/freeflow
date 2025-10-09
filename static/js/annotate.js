// Annotation interface functionality

let canvas, ctx;
let images = [];
let currentImageIndex = 0;
let currentImage = null;
let classes = [];
let selectedClassId = null;
let externalModels = [];
let selectedExternalModel = null;
let selectedModelInfo = null;
let classMapping = {};
let labelAssistEnabled = false;
let labelAssistConfig = {
    modelPath: null,
    confidence: 0.5,
    clearExisting: true
};
let annotations = [];
let isDrawing = false;
let startX, startY;
let currentBox = null;
let zoom = 1;
let panX = 0, panY = 0;
let history = [];
let historyIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('annotationCanvas');
    ctx = canvas.getContext('2d');
    
    loadClasses();
    loadImages();
    loadExternalModels();
    setupCanvas();
    setupKeyboardShortcuts();
});

async function loadClasses() {
    try {
        classes = await apiCall(`/api/projects/${PROJECT_ID}/classes`);
        renderClasses();
    } catch (error) {
        showToast('Failed to load classes', 'error');
    }
}

function renderClasses() {
    const classesList = document.getElementById('classesList');
    classesList.innerHTML = classes.map((cls, index) => `
        <button class="class-btn ${index === 0 ? 'active' : ''}" 
                data-class-id="${cls.id}" 
                onclick="selectClass(${cls.id})">
            <div class="class-color" style="background: ${cls.color}"></div>
            <span class="class-name">${cls.name}</span>
            <span style="margin-left: auto; opacity: 0.5;">${index + 1}</span>
        </button>
    `).join('');
    
    if (classes.length > 0) {
        selectedClassId = classes[0].id;
    }
}

function selectClass(classId) {
    selectedClassId = classId;
    document.querySelectorAll('.class-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.classId == classId);
    });
}

async function loadImages() {
    try {
        const data = await apiCall(`/api/projects/${PROJECT_ID}/images`);
        images = [];
        
        data.batches.forEach(batch => {
            images.push(...batch.images);
        });
        
        if (images.length > 0) {
            loadImage(0);
        } else {
            showToast('No images to annotate', 'error');
        }
        
        updateImageCounter();
    } catch (error) {
        showToast('Failed to load images', 'error');
    }
}

async function loadImage(index) {
    if (index < 0 || index >= images.length) return;
    
    currentImageIndex = index;
    const imageData = images[index];
    
    try {
        // Load image annotations
        const data = await apiCall(`/api/images/${imageData.id}/annotations`);
        annotations = data.annotations;
        
        // Load the image
        const img = document.getElementById('imageElement');
        img.onload = async () => {
            currentImage = img;
            resizeCanvas();
            drawCanvas();
            renderAnnotationsList();
            
            // Auto-run label assist if enabled
            if (labelAssistEnabled && labelAssistConfig.modelPath) {
                await runAutoLabelAssist();
            }
        };
        img.src = `/api/images/${imageData.id}`;
        
        updateImageCounter();
    } catch (error) {
        showToast('Failed to load image', 'error');
    }
}

function updateImageCounter() {
    document.getElementById('imageCounter').textContent = 
        `${currentImageIndex + 1} / ${images.length}`;
    
    document.getElementById('prevBtn').disabled = currentImageIndex === 0;
    document.getElementById('nextBtn').disabled = currentImageIndex === images.length - 1;
}

function resizeCanvas() {
    if (!currentImage) return;
    
    const container = canvas.parentElement;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;
    
    const imgRatio = currentImage.width / currentImage.height;
    const containerRatio = maxWidth / maxHeight;
    
    if (imgRatio > containerRatio) {
        canvas.width = maxWidth;
        canvas.height = maxWidth / imgRatio;
    } else {
        canvas.height = maxHeight;
        canvas.width = maxHeight * imgRatio;
    }
    
    zoom = 1;
    panX = 0;
    panY = 0;
}

function setupCanvas() {
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);
}

function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;
    
    isDrawing = true;
    startX = x;
    startY = y;
}

function handleMouseMove(e) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;
    
    currentBox = {
        x_center: (startX + x) / 2,
        y_center: (startY + y) / 2,
        width: Math.abs(x - startX),
        height: Math.abs(y - startY)
    };
    
    drawCanvas();
}

function handleMouseUp(e) {
    if (!isDrawing) return;
    
    isDrawing = false;
    
    if (currentBox && currentBox.width > 0.01 && currentBox.height > 0.01) {
        const annotation = {
            id: Date.now(),
            class_id: selectedClassId,
            class_name: classes.find(c => c.id === selectedClassId).name,
            ...currentBox,
            confidence: 1.0,
            is_predicted: false
        };
        
        annotations.push(annotation);
        addToHistory();
        renderAnnotationsList();
    }
    
    currentBox = null;
    drawCanvas();
}

function handleWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom *= delta;
    zoom = Math.max(0.5, Math.min(5, zoom));
    
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
    drawCanvas();
}

function drawCanvas() {
    if (!currentImage) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw image
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(panX, panY);
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Draw annotations
    annotations.forEach((ann, index) => {
        const cls = classes.find(c => c.id === ann.class_id);
        if (!cls) return;
        
        const x = (ann.x_center - ann.width / 2) * canvas.width;
        const y = (ann.y_center - ann.height / 2) * canvas.height;
        const w = ann.width * canvas.width;
        const h = ann.height * canvas.height;
        
        ctx.strokeStyle = cls.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        // Draw label
        ctx.fillStyle = cls.color;
        ctx.fillRect(x, y - 24, ctx.measureText(cls.name).width + 12, 24);
        ctx.fillStyle = 'white';
        ctx.font = '14px sans-serif';
        ctx.fillText(cls.name, x + 6, y - 6);
    });
    
    // Draw current box
    if (currentBox) {
        const cls = classes.find(c => c.id === selectedClassId);
        const x = (currentBox.x_center - currentBox.width / 2) * canvas.width;
        const y = (currentBox.y_center - currentBox.height / 2) * canvas.height;
        const w = currentBox.width * canvas.width;
        const h = currentBox.height * canvas.height;
        
        ctx.strokeStyle = cls.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }
    
    document.getElementById('annotationCount').textContent = annotations.length;
}

function renderAnnotationsList() {
    const list = document.getElementById('annotationsList');
    
    if (annotations.length === 0) {
        list.innerHTML = '<p class="empty-state">No annotations</p>';
        return;
    }
    
    list.innerHTML = annotations.map((ann, index) => `
        <div class="annotation-item">
            <div class="class-color" style="background: ${classes.find(c => c.id === ann.class_id)?.color}"></div>
            <span>${ann.class_name}</span>
            <button class="btn-icon" onclick="deleteAnnotation(${index})">✕</button>
        </div>
    `).join('');
}

function deleteAnnotation(index) {
    annotations.splice(index, 1);
    addToHistory();
    drawCanvas();
    renderAnnotationsList();
}

function addToHistory() {
    history = history.slice(0, historyIndex + 1);
    history.push(JSON.parse(JSON.stringify(annotations)));
    historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        annotations = JSON.parse(JSON.stringify(history[historyIndex]));
        drawCanvas();
        renderAnnotationsList();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        annotations = JSON.parse(JSON.stringify(history[historyIndex]));
        drawCanvas();
        renderAnnotationsList();
    }
}

async function saveAnnotations() {
    try {
        const imageData = images[currentImageIndex];
        
        await apiCall(`/api/images/${imageData.id}/annotations`, {
            method: 'POST',
            body: JSON.stringify({
                annotations: annotations.map(ann => ({
                    class_id: ann.class_id,
                    x_center: ann.x_center,
                    y_center: ann.y_center,
                    width: ann.width,
                    height: ann.height
                })),
                status: 'completed'
            })
        });
        
        showToast('Annotations saved!', 'success');
        
        // Move to next image
        if (currentImageIndex < images.length - 1) {
            nextImage();
        }
    } catch (error) {
        showToast('Failed to save annotations', 'error');
    }
}

function previousImage() {
    if (currentImageIndex > 0) {
        loadImage(currentImageIndex - 1);
    }
}

function nextImage() {
    if (currentImageIndex < images.length - 1) {
        loadImage(currentImageIndex + 1);
    }
}

function zoomIn() {
    zoom *= 1.2;
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
    drawCanvas();
}

function zoomOut() {
    zoom /= 1.2;
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
    drawCanvas();
}

function resetZoom() {
    zoom = 1;
    panX = 0;
    panY = 0;
    document.getElementById('zoomLevel').textContent = '100%';
    drawCanvas();
}

function toggleAnnotationVisibility() {
    // This would toggle annotation visibility
    drawCanvas();
}

function toggleLabelAssist() {
    const panel = document.getElementById('labelAssistPanel');
    const assistBtn = document.getElementById('assistBtn');
    
    if (labelAssistEnabled) {
        // Disable label assist mode
        labelAssistEnabled = false;
        assistBtn.style.background = '';
        assistBtn.style.color = '';
        showToast('Label Assist disabled', 'info');
        panel.style.display = 'none';
    } else {
        // Show configuration panel
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        
        if (panel.style.display === 'block') {
            renderAssistClasses();
        }
    }
}

function closeLabelAssist() {
    document.getElementById('labelAssistPanel').style.display = 'none';
}

async function loadExternalModels() {
    try {
        const data = await apiCall(`/api/projects/${PROJECT_ID}/external-models`);
        externalModels = data.models;
    } catch (error) {
        console.log('No external models available');
    }
}

function renderAssistClasses() {
    const list = document.getElementById('assistClassesList');
    
    // Add persistent mode checkbox
    let persistentModeHtml = `
        <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(124, 58, 237, 0.1); border-radius: 0.5rem; border: 1px solid var(--primary-color);">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer;">
                <input type="checkbox" id="enablePersistentAssist" ${labelAssistEnabled ? 'checked' : ''}>
                <span>Enable Continuous Label Assist</span>
            </label>
            <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; margin-left: 1.5rem;">
                Auto-label all images as you navigate
            </p>
        </div>
        <div style="margin-bottom: 1rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="clearExistingAnnotations" ${labelAssistConfig.clearExisting ? 'checked' : ''}>
                <span style="font-size: 0.875rem;">Clear existing annotations before assist</span>
            </label>
        </div>
    `;
    
    // Add model selection if external models are available
    let modelSelectHtml = '';
    if (externalModels && externalModels.length > 0) {
        modelSelectHtml = `
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Model Source:</label>
                <select id="modelSourceSelect" style="width: 100%; padding: 0.5rem; border-radius: 0.375rem; border: 1px solid var(--border);">
                    <option value="trained">Trained Model</option>
                    ${externalModels.map(modelDir => 
                        modelDir.models.map(m => 
                            `<option value="${m.path}" data-classes='${JSON.stringify(m.classes)}' ${selectedExternalModel === m.path ? 'selected' : ''}>${modelDir.model_dir}/${m.name}</option>`
                        ).join('')
                    ).join('')}
                </select>
            </div>
            <div id="classMappingSection" style="display: ${selectedExternalModel ? 'block' : 'none'}; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
                <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: 0.75rem;">Map Model Classes to Your Classes:</h4>
                <div id="classMappingList"></div>
            </div>
        `;
    }
    
    list.innerHTML = persistentModeHtml + modelSelectHtml + `
        <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; margin-top: 1rem;">Your Classes:</h4>
        ${classes.map(cls => `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem;">
                <input type="checkbox" checked value="${cls.id}">
                <div class="class-color" style="background: ${cls.color}; width: 1rem; height: 1rem;"></div>
                <span>${cls.name}</span>
            </label>
        `).join('')}
    `;
    
    document.getElementById('confidenceSlider').oninput = function() {
        document.getElementById('confidenceValue').textContent = this.value + '%';
        labelAssistConfig.confidence = this.value / 100;
    };
    
    document.getElementById('overlapSlider').oninput = function() {
        document.getElementById('overlapValue').textContent = this.value + '%';
    };
    
    // Set up persistent assist checkbox
    document.getElementById('enablePersistentAssist').onchange = function() {
        // This will be handled by runLabelAssist
    };
    
    // Set up clear existing checkbox
    document.getElementById('clearExistingAnnotations').onchange = function() {
        labelAssistConfig.clearExisting = this.checked;
    };
    
    // Set up model selection listener
    if (document.getElementById('modelSourceSelect')) {
        document.getElementById('modelSourceSelect').onchange = function() {
            selectedExternalModel = this.value === 'trained' ? null : this.value;
            
            if (selectedExternalModel) {
                // Get model classes from data attribute
                const selectedOption = this.options[this.selectedIndex];
                const modelClasses = JSON.parse(selectedOption.dataset.classes || '[]');
                selectedModelInfo = { classes: modelClasses };
                
                // Show class mapping section
                if (modelClasses.length > 0) {
                    document.getElementById('classMappingSection').style.display = 'block';
                    renderClassMapping(modelClasses);
                } else {
                    document.getElementById('classMappingSection').style.display = 'none';
                }
            } else {
                document.getElementById('classMappingSection').style.display = 'none';
                selectedModelInfo = null;
                classMapping = {};
            }
        };
        
        // Trigger change if already selected
        if (selectedExternalModel) {
            const selectElement = document.getElementById('modelSourceSelect');
            const event = new Event('change');
            selectElement.dispatchEvent(event);
        }
    }
}

function renderClassMapping(modelClasses) {
    const mappingList = document.getElementById('classMappingList');
    classMapping = {};
    
    mappingList.innerHTML = modelClasses.map(modelCls => `
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="flex: 1; font-size: 0.875rem;">${modelCls.name}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14m-7-7l7 7-7 7"/>
            </svg>
            <select id="mapping_${modelCls.id}" onchange="updateClassMapping(${modelCls.id}, this.value)" 
                    style="flex: 1; padding: 0.375rem; border-radius: 0.375rem; border: 1px solid var(--border); font-size: 0.875rem;">
                <option value="">-- Skip --</option>
                ${classes.map(cls => `
                    <option value="${cls.id}" ${modelCls.id < classes.length && classes[modelCls.id].id === cls.id ? 'selected' : ''}>
                        ${cls.name}
                    </option>
                `).join('')}
            </select>
        </div>
    `).join('');
    
    // Initialize default mappings
    modelClasses.forEach(modelCls => {
        if (modelCls.id < classes.length) {
            classMapping[modelCls.id] = classes[modelCls.id].id;
        }
    });
}

function updateClassMapping(modelClassId, projectClassId) {
    if (projectClassId) {
        classMapping[modelClassId] = parseInt(projectClassId);
    } else {
        delete classMapping[modelClassId];
    }
}

async function runLabelAssist() {
    const enablePersistent = document.getElementById('enablePersistentAssist').checked;
    
    if (enablePersistent) {
        // Enable persistent mode
        labelAssistEnabled = true;
        labelAssistConfig.modelPath = selectedExternalModel || 'trained';
        labelAssistConfig.confidence = document.getElementById('confidenceSlider').value / 100;
        labelAssistConfig.clearExisting = document.getElementById('clearExistingAnnotations').checked;
        
        // Update button appearance
        const assistBtn = document.getElementById('assistBtn');
        assistBtn.style.background = 'var(--primary-color)';
        assistBtn.style.color = 'white';
        
        showToast('Continuous Label Assist enabled! 🚀', 'success');
        closeLabelAssist();
        
        // Run on current image
        await runAutoLabelAssist();
    } else {
        // Run once on current image
        await runSingleLabelAssist();
        closeLabelAssist();
    }
}

async function runSingleLabelAssist() {
    try {
        showToast('Running Label Assist...', 'info');
        
        const imageData = images[currentImageIndex];
        const confidence = document.getElementById('confidenceSlider').value / 100;
        const clearExisting = document.getElementById('clearExistingAnnotations').checked;
        
        // Clear existing annotations if requested
        if (clearExisting) {
            annotations = [];
        }
        
        let result;
        
        if (selectedExternalModel) {
            // Use external model with class mapping
            result = await apiCall(`/api/projects/${PROJECT_ID}/use-external-model`, {
                method: 'POST',
                body: JSON.stringify({
                    model_path: selectedExternalModel,
                    image_id: imageData.id,
                    confidence,
                    class_mapping: classMapping
                })
            });
        } else {
            // Use trained model
            result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                method: 'POST',
                body: JSON.stringify({
                    image_id: imageData.id,
                    confidence
                })
            });
        }
        
        // Add predictions to annotations
        result.predictions.forEach(pred => {
            annotations.push({
                id: Date.now() + Math.random(),
                class_id: pred.class_id,
                class_name: classes.find(c => c.id === pred.class_id).name,
                x_center: pred.x_center,
                y_center: pred.y_center,
                width: pred.width,
                height: pred.height,
                confidence: pred.confidence,
                is_predicted: true
            });
        });
        
        addToHistory();
        drawCanvas();
        renderAnnotationsList();
        
        showToast(`Added ${result.predictions.length} predictions`, 'success');
        
    } catch (error) {
        showToast(selectedExternalModel ? 'External model failed!' : 'Label Assist failed. Train a model first!', 'error');
    }
}

async function runAutoLabelAssist() {
    try {
        const imageData = images[currentImageIndex];
        
        // Clear existing annotations if configured
        if (labelAssistConfig.clearExisting) {
            annotations = [];
        }
        
        let result;
        
        if (labelAssistConfig.modelPath !== 'trained') {
            // Use external model
            result = await apiCall(`/api/projects/${PROJECT_ID}/use-external-model`, {
                method: 'POST',
                body: JSON.stringify({
                    model_path: labelAssistConfig.modelPath,
                    image_id: imageData.id,
                    confidence: labelAssistConfig.confidence,
                    class_mapping: classMapping
                })
            });
        } else {
            // Use trained model
            result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                method: 'POST',
                body: JSON.stringify({
                    image_id: imageData.id,
                    confidence: labelAssistConfig.confidence
                })
            });
        }
        
        // Add predictions to annotations
        result.predictions.forEach(pred => {
            annotations.push({
                id: Date.now() + Math.random(),
                class_id: pred.class_id,
                class_name: classes.find(c => c.id === pred.class_id).name,
                x_center: pred.x_center,
                y_center: pred.y_center,
                width: pred.width,
                height: pred.height,
                confidence: pred.confidence,
                is_predicted: true
            });
        });
        
        addToHistory();
        drawCanvas();
        renderAnnotationsList();
        
        // Show subtle notification
        console.log(`Auto-labeled: ${result.predictions.length} predictions`);
        
    } catch (error) {
        console.error('Auto label assist failed:', error);
        // Don't show error toast to avoid spam, just disable
        labelAssistEnabled = false;
        const assistBtn = document.getElementById('assistBtn');
        assistBtn.style.background = '';
        assistBtn.style.color = '';
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Number keys to select classes
        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (index < classes.length) {
                selectClass(classes[index].id);
            }
        }
        
        // Arrow keys for navigation
        if (e.key === 'ArrowLeft') {
            previousImage();
        } else if (e.key === 'ArrowRight') {
            nextImage();
        }
        
        // Ctrl+Z for undo
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
        }
        
        // Ctrl+Y for redo
        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            redo();
        }
        
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveAnnotations();
        }
    });
}

