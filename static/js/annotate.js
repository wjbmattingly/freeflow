// Annotation interface functionality

let canvas, ctx;
let images = [];
let allImages = [];
let currentFilter = 'all'; // 'all', 'annotated', 'unannotated'
let currentImageIndex = 0;
let currentImage = null;
let classes = [];
let selectedClassId = null;
let externalModels = [];
let trainedModels = [];
let customModels = [];
let selectedExternalModel = null;
let selectedModelInfo = null;
let classMapping = {};
let labelAssistEnabled = false;
let labelAssistConfig = {
    modelPath: null,
    confidence: 0.5,
    clearExisting: true
};
let autoSaveEnabled = false;
let annotations = [];
let isDrawing = false;
let startX, startY;
let currentBox = null;
let selectedAnnotation = null;
let isDragging = false;
let dragHandle = null; // 'move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
let zoom = 1;
let panX = 0, panY = 0;
let history = [];
let historyIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('annotationCanvas');
    ctx = canvas.getContext('2d');
    
    // Get filter from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    currentFilter = urlParams.get('filter') || 'all';
    
    loadClasses();
    loadImages();
    loadExternalModels();
    loadTrainedModels();
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
        allImages = [];
        
        data.batches.forEach(batch => {
            allImages.push(...batch.images);
        });
        
        // Apply filter
        if (currentFilter === 'all') {
            images = [...allImages];
        } else if (currentFilter === 'annotated') {
            images = allImages.filter(img => img.status === 'completed');
        } else if (currentFilter === 'unannotated') {
            images = allImages.filter(img => img.status !== 'completed');
        }
        
        if (images.length === 0) {
            showToast(`No ${currentFilter} images to annotate`, 'error');
            return;
        }
        
        // Check if specific image ID is provided in URL
        const urlParams = new URLSearchParams(window.location.search);
        const imageId = urlParams.get('image');
        
        if (imageId) {
            const index = images.findIndex(img => img.id == imageId);
            if (index !== -1) {
                loadImage(index);
            } else {
                // Image not in filtered list, load first image
                loadImage(0);
            }
        } else {
            loadImage(0);
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
            if (labelAssistEnabled && (labelAssistConfig.modelPath || labelAssistConfig.modelType)) {
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
    
    // Check if clicking on a handle of selected annotation
    if (selectedAnnotation) {
        const handle = getHandleAtPosition(x, y, selectedAnnotation);
        if (handle) {
            isDragging = true;
            dragHandle = handle;
            startX = x;
            startY = y;
            return;
        }
    }
    
    // Check if clicking on an existing annotation
    const clicked = getAnnotationAtPosition(x, y);
    if (clicked) {
        selectedAnnotation = clicked;
        drawCanvas();
        renderAnnotationsList();
        return;
    }
    
    // Otherwise, start drawing new box
    selectedAnnotation = null;
    isDrawing = true;
    startX = x;
    startY = y;
}

function getAnnotationAtPosition(x, y) {
    // Check in reverse order (most recent first)
    for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        const left = ann.x_center - ann.width / 2;
        const right = ann.x_center + ann.width / 2;
        const top = ann.y_center - ann.height / 2;
        const bottom = ann.y_center + ann.height / 2;
        
        if (x >= left && x <= right && y >= top && y <= bottom) {
            return ann;
        }
    }
    return null;
}

function getHandleAtPosition(x, y, annotation) {
    const handleSize = 0.015; // 1.5% of canvas size for better click target
    const left = annotation.x_center - annotation.width / 2;
    const right = annotation.x_center + annotation.width / 2;
    const top = annotation.y_center - annotation.height / 2;
    const bottom = annotation.y_center + annotation.height / 2;
    const cx = annotation.x_center;
    const cy = annotation.y_center;
    
    // Corner handles (check corners first for priority)
    if (Math.abs(x - left) < handleSize && Math.abs(y - top) < handleSize) return 'nw';
    if (Math.abs(x - right) < handleSize && Math.abs(y - top) < handleSize) return 'ne';
    if (Math.abs(x - left) < handleSize && Math.abs(y - bottom) < handleSize) return 'sw';
    if (Math.abs(x - right) < handleSize && Math.abs(y - bottom) < handleSize) return 'se';
    
    // Edge handles
    if (Math.abs(x - cx) < handleSize && Math.abs(y - top) < handleSize) return 'n';
    if (Math.abs(x - cx) < handleSize && Math.abs(y - bottom) < handleSize) return 's';
    if (Math.abs(x - left) < handleSize && Math.abs(y - cy) < handleSize) return 'w';
    if (Math.abs(x - right) < handleSize && Math.abs(y - cy) < handleSize) return 'e';
    
    // Center (move) - check if inside the box
    const insideX = x >= left && x <= right;
    const insideY = y >= top && y <= bottom;
    if (insideX && insideY) return 'move';
    
    return null;
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;
    
    // Update cursor based on position
    if (!isDrawing && !isDragging && selectedAnnotation) {
        const handle = getHandleAtPosition(x, y, selectedAnnotation);
        if (handle) {
            const cursors = {
                'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
                'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize',
                'move': 'move'
            };
            canvas.style.cursor = cursors[handle] || 'default';
        } else {
            canvas.style.cursor = 'default';
        }
    } else if (!isDrawing && !isDragging) {
        canvas.style.cursor = getAnnotationAtPosition(x, y) ? 'pointer' : 'crosshair';
    }
    
    if (isDragging && selectedAnnotation) {
        const dx = x - startX;
        const dy = y - startY;
        
        const left = selectedAnnotation.x_center - selectedAnnotation.width / 2;
        const right = selectedAnnotation.x_center + selectedAnnotation.width / 2;
        const top = selectedAnnotation.y_center - selectedAnnotation.height / 2;
        const bottom = selectedAnnotation.y_center + selectedAnnotation.height / 2;
        
        if (dragHandle === 'move') {
            selectedAnnotation.x_center += dx;
            selectedAnnotation.y_center += dy;
        } else if (dragHandle === 'nw') {
            const newLeft = left + dx;
            const newTop = top + dy;
            selectedAnnotation.width = right - newLeft;
            selectedAnnotation.height = bottom - newTop;
            selectedAnnotation.x_center = (newLeft + right) / 2;
            selectedAnnotation.y_center = (newTop + bottom) / 2;
        } else if (dragHandle === 'ne') {
            const newRight = right + dx;
            const newTop = top + dy;
            selectedAnnotation.width = newRight - left;
            selectedAnnotation.height = bottom - newTop;
            selectedAnnotation.x_center = (left + newRight) / 2;
            selectedAnnotation.y_center = (newTop + bottom) / 2;
        } else if (dragHandle === 'sw') {
            const newLeft = left + dx;
            const newBottom = bottom + dy;
            selectedAnnotation.width = right - newLeft;
            selectedAnnotation.height = newBottom - top;
            selectedAnnotation.x_center = (newLeft + right) / 2;
            selectedAnnotation.y_center = (top + newBottom) / 2;
        } else if (dragHandle === 'se') {
            const newRight = right + dx;
            const newBottom = bottom + dy;
            selectedAnnotation.width = newRight - left;
            selectedAnnotation.height = newBottom - top;
            selectedAnnotation.x_center = (left + newRight) / 2;
            selectedAnnotation.y_center = (top + newBottom) / 2;
        } else if (dragHandle === 'n') {
            const newTop = top + dy;
            selectedAnnotation.height = bottom - newTop;
            selectedAnnotation.y_center = (newTop + bottom) / 2;
        } else if (dragHandle === 's') {
            const newBottom = bottom + dy;
            selectedAnnotation.height = newBottom - top;
            selectedAnnotation.y_center = (top + newBottom) / 2;
        } else if (dragHandle === 'w') {
            const newLeft = left + dx;
            selectedAnnotation.width = right - newLeft;
            selectedAnnotation.x_center = (newLeft + right) / 2;
        } else if (dragHandle === 'e') {
            const newRight = right + dx;
            selectedAnnotation.width = newRight - left;
            selectedAnnotation.x_center = (left + newRight) / 2;
        }
        
        startX = x;
        startY = y;
        drawCanvas();
    } else if (isDrawing) {
        currentBox = {
            x_center: (startX + x) / 2,
            y_center: (startY + y) / 2,
            width: Math.abs(x - startX),
            height: Math.abs(y - startY)
        };
        drawCanvas();
    }
}

function handleMouseUp(e) {
    if (isDragging) {
        isDragging = false;
        dragHandle = null;
        addToHistory();
        canvas.style.cursor = 'default';
        return;
    }
    
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
        
        const isSelected = selectedAnnotation && selectedAnnotation.id === ann.id;
        const x = (ann.x_center - ann.width / 2) * canvas.width;
        const y = (ann.y_center - ann.height / 2) * canvas.height;
        const w = ann.width * canvas.width;
        const h = ann.height * canvas.height;
        
        ctx.strokeStyle = cls.color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(x, y, w, h);
        
        // Draw label
        ctx.fillStyle = cls.color;
        ctx.fillRect(x, y - 24, ctx.measureText(cls.name).width + 12, 24);
        ctx.fillStyle = 'white';
        ctx.font = '14px sans-serif';
        ctx.fillText(cls.name, x + 6, y - 6);
        
        // Draw resize handles for selected annotation
        if (isSelected) {
            const handleSize = 8;
            ctx.fillStyle = cls.color;
            
            // Corner handles
            ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x + w - handleSize/2, y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x + w - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
            
            // Edge handles
            ctx.fillRect(x + w/2 - handleSize/2, y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x + w/2 - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x - handleSize/2, y + h/2 - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x + w - handleSize/2, y + h/2 - handleSize/2, handleSize, handleSize);
        }
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
    
    list.innerHTML = annotations.map((ann, index) => {
        const isSelected = selectedAnnotation && selectedAnnotation.id === ann.id;
        return `
            <div class="annotation-item ${isSelected ? 'selected' : ''}" 
                 onclick="selectAnnotationFromList(${ann.id})" 
                 style="cursor: pointer; background: ${isSelected ? 'rgba(124, 58, 237, 0.1)' : ''}; border: ${isSelected ? '1px solid var(--primary-color)' : '1px solid transparent'};">
                <div class="class-color" style="background: ${classes.find(c => c.id === ann.class_id)?.color}"></div>
                ${isSelected ? `
                    <select onchange="changeAnnotationClass(${ann.id}, this.value)" onclick="event.stopPropagation()" style="flex: 1; padding: 0.25rem; border-radius: 0.25rem; border: 1px solid var(--border);">
                        ${classes.map(cls => `
                            <option value="${cls.id}" ${cls.id === ann.class_id ? 'selected' : ''}>${cls.name}</option>
                        `).join('')}
                    </select>
                ` : `<span>${ann.class_name}</span>`}
                <button class="btn-icon" onclick="event.stopPropagation(); deleteAnnotation(${ann.id})">✕</button>
            </div>
        `;
    }).join('');
}

function selectAnnotationFromList(annId) {
    selectedAnnotation = annotations.find(a => a.id === annId);
    drawCanvas();
    renderAnnotationsList();
}

function changeAnnotationClass(annId, newClassId) {
    const ann = annotations.find(a => a.id === annId);
    if (ann) {
        ann.class_id = parseInt(newClassId);
        ann.class_name = classes.find(c => c.id == newClassId).name;
        addToHistory();
        drawCanvas();
        renderAnnotationsList();
    }
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

async function saveAnnotations(autoNavigate = true) {
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
        
        // Update image status in local array
        if (images[currentImageIndex]) {
            images[currentImageIndex].status = 'completed';
        }
        
        if (!autoSaveEnabled) {
            showToast('Annotations saved!', 'success');
        }
        
        // Move to next image only if requested and not auto-saving
        if (autoNavigate && !autoSaveEnabled && currentImageIndex < images.length - 1) {
            nextImage();
        }
    } catch (error) {
        showToast('Failed to save annotations', 'error');
        throw error; // Re-throw to prevent navigation on save failure
    }
}

async function previousImage() {
    if (currentImageIndex > 0) {
        if (autoSaveEnabled) {
            try {
                await saveAnnotations(false);
            } catch (error) {
                return; // Don't navigate if save failed
            }
        }
        loadImage(currentImageIndex - 1);
    }
}

async function nextImage() {
    if (currentImageIndex < images.length - 1) {
        if (autoSaveEnabled) {
            try {
                await saveAnnotations(false);
            } catch (error) {
                return; // Don't navigate if save failed
            }
        }
        loadImage(currentImageIndex + 1);
    }
}

function toggleAutoSave() {
    autoSaveEnabled = document.getElementById('autoSaveCheckbox').checked;
    if (autoSaveEnabled) {
        showToast('Auto-save enabled! 💾', 'success');
    } else {
        showToast('Auto-save disabled', 'info');
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

async function loadTrainedModels() {
    try {
        const projectData = await apiCall(`/api/projects/${PROJECT_ID}`);
        trainedModels = projectData.training_jobs.filter(job => 
            job.status === 'completed' && job.model_path
        );
        customModels = projectData.custom_models || [];
        console.log('Loaded models:', { trainedModels, customModels });
    } catch (error) {
        console.log('No trained models available');
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
    
    // Add model selection dropdown with trained, custom, and external models
    let modelSelectHtml = '';
    const hasModels = (trainedModels && trainedModels.length > 0) || 
                      (customModels && customModels.length > 0) ||
                      (externalModels && externalModels.length > 0);
    
    if (hasModels) {
        let modelOptions = '';
        
        // Add trained models
        if (trainedModels && trainedModels.length > 0) {
            modelOptions += '<optgroup label="🎓 Your Trained Models">';
            modelOptions += trainedModels.map(model => {
                const modelSizeLabel = {
                    'n': 'Nano',
                    's': 'Small',
                    'm': 'Medium',
                    'l': 'Large',
                    'x': 'X-Large'
                }[model.model_size || 'n'];
                
                return `<option value="trained:${model.id}" data-model-type="trained">${model.name} (${modelSizeLabel})</option>`;
            }).join('');
            modelOptions += '</optgroup>';
        }
        
        // Add custom uploaded models
        if (customModels && customModels.length > 0) {
            modelOptions += '<optgroup label="📤 Your Uploaded Models">';
            modelOptions += customModels.map(model => 
                `<option value="custom:${model.id}" data-model-type="custom" data-file-path="${model.file_path}">${model.name}</option>`
            ).join('');
            modelOptions += '</optgroup>';
        }
        
        // Add external models from output_models folder
        if (externalModels && externalModels.length > 0) {
            modelOptions += '<optgroup label="📦 External Models (output_models/)">';
            modelOptions += externalModels.map(modelDir => 
                modelDir.models.map(m => 
                    `<option value="external:${m.path}" data-classes='${JSON.stringify(m.classes)}' data-model-type="external">${modelDir.model_dir}/${m.name}</option>`
                ).join('')
            ).join('');
            modelOptions += '</optgroup>';
        }
        
        modelSelectHtml = `
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Select Model:</label>
                <select id="modelSourceSelect" style="width: 100%; padding: 0.5rem; border-radius: 0.375rem; border: 1px solid var(--border);">
                    ${modelOptions}
                </select>
            </div>
            <div id="classMappingSection" style="display: none; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
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
            const value = this.value;
            const [modelType, modelId] = value.split(':');
            
            if (modelType === 'trained') {
                // Using a trained model
                selectedExternalModel = null;
                document.getElementById('classMappingSection').style.display = 'none';
                selectedModelInfo = { type: 'trained', id: parseInt(modelId) };
                classMapping = {};
            } else if (modelType === 'custom') {
                // Using a custom uploaded model
                selectedExternalModel = null;
                document.getElementById('classMappingSection').style.display = 'none';
                const selectedOption = this.options[this.selectedIndex];
                selectedModelInfo = { 
                    type: 'custom', 
                    id: parseInt(modelId),
                    filePath: selectedOption.dataset.filePath 
                };
                classMapping = {};
            } else if (modelType === 'external') {
                // Using an external model
                selectedExternalModel = modelId;
                
                // Get model classes from data attribute
                const selectedOption = this.options[this.selectedIndex];
                const modelClasses = JSON.parse(selectedOption.dataset.classes || '[]');
                selectedModelInfo = { type: 'external', classes: modelClasses };
                
                // Show class mapping section for external models
                if (modelClasses.length > 0) {
                    document.getElementById('classMappingSection').style.display = 'block';
                    renderClassMapping(modelClasses);
                } else {
                    document.getElementById('classMappingSection').style.display = 'none';
                }
            }
        };
        
        // Set default selection and trigger change to initialize
        const selectElement = document.getElementById('modelSourceSelect');
        
        // Restore previous selection if it exists
        if (selectedModelInfo) {
            if (selectedModelInfo.type === 'trained') {
                selectElement.value = `trained:${selectedModelInfo.id}`;
            } else if (selectedModelInfo.type === 'custom') {
                selectElement.value = `custom:${selectedModelInfo.id}`;
            } else if (selectedModelInfo.type === 'external' && selectedExternalModel) {
                selectElement.value = `external:${selectedExternalModel}`;
            }
        }
        
        // Trigger change to initialize
        const event = new Event('change');
        selectElement.dispatchEvent(event);
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
        labelAssistConfig.confidence = document.getElementById('confidenceSlider').value / 100;
        labelAssistConfig.clearExisting = document.getElementById('clearExistingAnnotations').checked;
        
        // Store the current model selection
        if (selectedExternalModel) {
            labelAssistConfig.modelPath = selectedExternalModel;
            labelAssistConfig.modelType = 'external';
        } else if (selectedModelInfo) {
            labelAssistConfig.modelType = selectedModelInfo.type;
            labelAssistConfig.modelInfo = selectedModelInfo;
        } else {
            labelAssistConfig.modelType = 'latest';
        }
        
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
        } else if (selectedModelInfo && selectedModelInfo.type === 'trained') {
            // Use specific trained model
            const trainedModel = trainedModels.find(m => m.id === selectedModelInfo.id);
            result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                method: 'POST',
                body: JSON.stringify({
                    image_id: imageData.id,
                    confidence,
                    model_path: trainedModel.model_path
                })
            });
        } else if (selectedModelInfo && selectedModelInfo.type === 'custom') {
            // Use custom uploaded model
            const customModel = customModels.find(m => m.id === selectedModelInfo.id);
            result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                method: 'POST',
                body: JSON.stringify({
                    image_id: imageData.id,
                    confidence,
                    model_path: customModel.file_path
                })
            });
        } else {
            // Use latest trained model (default behavior)
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
        
        console.log('🤖 Running auto label assist:', {
            modelType: labelAssistConfig.modelType,
            modelInfo: labelAssistConfig.modelInfo,
            customModelsCount: customModels.length,
            trainedModelsCount: trainedModels.length
        });
        
        // Clear existing annotations if configured
        if (labelAssistConfig.clearExisting) {
            annotations = [];
        }
        
        let result;
        
        // Use the same logic as runSingleLabelAssist but with stored config
        if (labelAssistConfig.modelType === 'external') {
            // Use external model with class mapping
            console.log('Using external model:', labelAssistConfig.modelPath);
            result = await apiCall(`/api/projects/${PROJECT_ID}/use-external-model`, {
                method: 'POST',
                body: JSON.stringify({
                    model_path: labelAssistConfig.modelPath,
                    image_id: imageData.id,
                    confidence: labelAssistConfig.confidence,
                    class_mapping: classMapping
                })
            });
        } else if (labelAssistConfig.modelType === 'trained' && labelAssistConfig.modelInfo) {
            // Use specific trained model
            const trainedModel = trainedModels.find(m => m.id === labelAssistConfig.modelInfo.id);
            console.log('Using trained model:', trainedModel ? trainedModel.name : 'NOT FOUND');
            if (trainedModel) {
                result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                    method: 'POST',
                    body: JSON.stringify({
                        image_id: imageData.id,
                        confidence: labelAssistConfig.confidence,
                        model_path: trainedModel.model_path
                    })
                });
            } else {
                console.error('Trained model not found!');
                return;
            }
        } else if (labelAssistConfig.modelType === 'custom' && labelAssistConfig.modelInfo) {
            // Use custom uploaded model
            const customModel = customModels.find(m => m.id === labelAssistConfig.modelInfo.id);
            console.log('Using custom model:', customModel ? customModel.name : 'NOT FOUND', 'Looking for ID:', labelAssistConfig.modelInfo.id);
            console.log('Available custom models:', customModels);
            if (customModel) {
                result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                    method: 'POST',
                    body: JSON.stringify({
                        image_id: imageData.id,
                        confidence: labelAssistConfig.confidence,
                        model_path: customModel.file_path
                    })
                });
            } else {
                console.error('Custom model not found! ID:', labelAssistConfig.modelInfo.id);
                return;
            }
        } else {
            // Use latest trained model (default behavior)
            console.log('Using latest trained model (default)');
            result = await apiCall(`/api/projects/${PROJECT_ID}/predict`, {
                method: 'POST',
                body: JSON.stringify({
                    image_id: imageData.id,
                    confidence: labelAssistConfig.confidence
                })
            });
        }
        
        if (!result || !result.predictions) {
            console.error('No result from prediction API');
            return;
        }
        
        console.log(`✅ Got ${result.predictions.length} predictions`);
        
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
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        
        // Delete or Backspace to delete selected annotation
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotation) {
            e.preventDefault();
            deleteAnnotation(selectedAnnotation.id);
            return;
        }
        
        // Escape to deselect
        if (e.key === 'Escape' && selectedAnnotation) {
            selectedAnnotation = null;
            drawCanvas();
            renderAnnotationsList();
            return;
        }
        
        // Number keys to select classes
        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (index < classes.length) {
                selectClass(classes[index].id);
                // If an annotation is selected, change its class
                if (selectedAnnotation) {
                    selectedAnnotation.class_id = classes[index].id;
                    selectedAnnotation.class_name = classes[index].name;
                    addToHistory();
                    drawCanvas();
                    renderAnnotationsList();
                }
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

function deleteAnnotation(annId) {
    annotations = annotations.filter(a => a.id !== annId);
    if (selectedAnnotation && selectedAnnotation.id === annId) {
        selectedAnnotation = null;
    }
    addToHistory();
    drawCanvas();
    renderAnnotationsList();
}

