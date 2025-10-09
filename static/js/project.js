// Project page functionality

let project = null;
let allImages = [];
let classes = [];
let datasetVersions = [];
let currentPage = 1;
let imagesPerPage = 20;

document.addEventListener('DOMContentLoaded', () => {
    loadProject();
    setupTabs();
    setupUploadArea();
    setupDatasetSplitListeners();
});

async function loadProject() {
    try {
        project = await apiCall(`/api/projects/${PROJECT_ID}`);
        document.getElementById('projectName').textContent = project.name;
        document.title = `${project.name} - FreeFlow`;
        
        await loadImages();
        await loadClasses();
        await loadDatasetVersions();
        await loadTrainedModels();
    } catch (error) {
        showToast('Failed to load project', 'error');
    }
}

async function loadImages() {
    try {
        const data = await apiCall(`/api/projects/${PROJECT_ID}/images`);
        
        // Flatten all images from batches
        allImages = [];
        data.batches.forEach(batch => {
            allImages.push(...batch.images);
        });
        
        // Update counts
        const totalCount = allImages.length;
        const annotatedCount = allImages.filter(img => img.status === 'completed').length;
        
        document.getElementById('totalImagesCount').textContent = totalCount;
        document.getElementById('annotatedImagesCount').textContent = annotatedCount;
        
        // Display images grid
        displayImagesGrid();
        
        // Update batches section
        const unassignedBatches = document.getElementById('unassignedBatches');
        document.getElementById('unassignedCount').textContent = data.batches.length;
        
        if (data.batches.length === 0) {
            unassignedBatches.innerHTML = '<p class="empty-state">No batches uploaded yet</p>';
        } else {
            unassignedBatches.innerHTML = data.batches.map(batch => `
                <div class="batch-card">
                    <div class="batch-header">
                        <span>Uploaded ${formatDate(batch.images[0].uploaded_at)}</span>
                        <button class="btn-icon" onclick="viewBatch('${batch.batch_id}')">→</button>
                    </div>
                    <div class="batch-meta">
                        ${batch.count} images • 
                        ${batch.images.filter(img => img.status === 'completed').length} annotated
                    </div>
                </div>
            `).join('');
        }
        
        document.getElementById('datasetCount').textContent = annotatedCount;
        
    } catch (error) {
        showToast('Failed to load images', 'error');
    }
}

function displayImagesGrid() {
    const grid = document.getElementById('imagesGrid');
    
    if (allImages.length === 0) {
        grid.innerHTML = '<p class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 3rem;">No images uploaded yet</p>';
        document.getElementById('paginationControls').style.display = 'none';
        return;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(allImages.length / imagesPerPage);
    const startIdx = (currentPage - 1) * imagesPerPage;
    const endIdx = Math.min(startIdx + imagesPerPage, allImages.length);
    const imagesToShow = allImages.slice(startIdx, endIdx);
    
    // Update showing count
    document.getElementById('showingCount').textContent = imagesToShow.length;
    
    // Render images
    grid.innerHTML = imagesToShow.map(img => `
        <div class="image-card ${img.status === 'completed' ? 'annotated' : ''}" 
             onclick="openAnnotation(${img.id})"
             title="${img.filename}">
            <img src="/api/images/${img.id}" 
                 alt="${img.filename}" 
                 class="image-thumbnail"
                 loading="lazy">
            <div class="image-card-info">
                <div class="image-card-name">${img.filename}</div>
                <div class="image-card-meta">
                    <span>${img.width} × ${img.height}</span>
                    <span class="status-badge ${img.status}">${img.status === 'completed' ? '✓ Annotated' : 'Not annotated'}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    // Update pagination controls
    if (totalPages > 1) {
        document.getElementById('paginationControls').style.display = 'flex';
        document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = currentPage === 1;
        document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
    } else {
        document.getElementById('paginationControls').style.display = 'none';
    }
}

function changeImagesPerPage() {
    imagesPerPage = parseInt(document.getElementById('imagesPerPage').value);
    currentPage = 1; // Reset to first page
    displayImagesGrid();
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        displayImagesGrid();
        // Scroll to top of images
        document.getElementById('imagesGrid').scrollIntoView({ behavior: 'smooth' });
    }
}

function nextPage() {
    const totalPages = Math.ceil(allImages.length / imagesPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayImagesGrid();
        // Scroll to top of images
        document.getElementById('imagesGrid').scrollIntoView({ behavior: 'smooth' });
    }
}

function openAnnotation(imageId) {
    // Find the image index in allImages
    const imageIndex = allImages.findIndex(img => img.id === imageId);
    if (imageIndex !== -1) {
        // Navigate to annotation page, could add image index as query param
        location.href = `/annotate/${PROJECT_ID}?image=${imageId}`;
    }
}

async function loadClasses() {
    try {
        classes = await apiCall(`/api/projects/${PROJECT_ID}/classes`);
        
        const classesListView = document.getElementById('classesListView');
        classesListView.innerHTML = classes.map(cls => `
            <div class="class-item" style="display: flex; align-items: center; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; margin-bottom: 0.75rem;">
                <input type="color" class="class-color-input" value="${cls.color}" 
                       onchange="updateClassColor(${cls.id}, this.value)" 
                       style="width: 3rem; height: 3rem; border: none; border-radius: 0.375rem; cursor: pointer; margin-right: 1rem;">
                <input type="text" class="class-name-input" value="${cls.name}" 
                       onblur="updateClassName(${cls.id}, this.value)"
                       style="flex: 1; padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.375rem; margin-right: 1rem;">
                <button class="btn btn-secondary" onclick="editClass(${cls.id}, '${cls.name}', '${cls.color}')" 
                        style="margin-right: 0.5rem;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn btn-secondary" onclick="deleteClass(${cls.id}, '${cls.name}')" 
                        style="color: var(--error);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        showToast('Failed to load classes', 'error');
    }
}

async function updateClassName(classId, newName) {
    if (!newName.trim()) {
        await loadClasses();
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/classes/${classId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        });
        showToast('Class name updated!', 'success');
        await loadClasses();
    } catch (error) {
        showToast('Failed to update class name', 'error');
        await loadClasses();
    }
}

async function updateClassColor(classId, newColor) {
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/classes/${classId}`, {
            method: 'PUT',
            body: JSON.stringify({ color: newColor })
        });
        showToast('Class color updated!', 'success');
        await loadClasses();
    } catch (error) {
        showToast('Failed to update class color', 'error');
    }
}

function editClass(classId, currentName, currentColor) {
    document.getElementById('newClassName').value = currentName;
    document.getElementById('newClassColor').value = currentColor;
    document.getElementById('addClassModal').classList.add('active');
    
    // Change the add button to update
    const addBtn = document.querySelector('#addClassModal .btn-primary');
    addBtn.textContent = 'Update Class';
    addBtn.onclick = () => updateExistingClass(classId);
}

async function updateExistingClass(classId) {
    const name = document.getElementById('newClassName').value.trim();
    const color = document.getElementById('newClassColor').value;
    
    if (!name) {
        showToast('Please enter a class name', 'error');
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/classes/${classId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, color })
        });
        
        showToast('Class updated successfully!', 'success');
        closeAddClassModal();
        await loadClasses();
        
        // Reset button
        const addBtn = document.querySelector('#addClassModal .btn-primary');
        addBtn.textContent = 'Add Class';
        addBtn.onclick = addNewClass;
        
    } catch (error) {
        showToast('Failed to update class', 'error');
    }
}

async function deleteClass(classId, className) {
    if (!confirm(`Delete class "${className}"? This will also delete all annotations with this class.`)) {
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/classes/${classId}`, {
            method: 'DELETE'
        });
        
        showToast('Class deleted successfully!', 'success');
        await loadClasses();
        
    } catch (error) {
        showToast('Failed to delete class', 'error');
    }
}

async function loadDatasetVersions() {
    try {
        datasetVersions = await apiCall(`/api/projects/${PROJECT_ID}/dataset-versions`);
        
        const versionsList = document.getElementById('datasetVersionsList');
        
        if (datasetVersions.length === 0) {
            versionsList.innerHTML = '<p class="empty-state">No dataset versions yet. Create one to organize your training data!</p>';
            return;
        }
        
        versionsList.innerHTML = datasetVersions.map(v => `
            <div class="dataset-version-card" style="background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h4 style="font-size: 1.125rem; margin-bottom: 0.5rem;">${v.name}</h4>
                        ${v.description ? `<p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">${v.description}</p>` : ''}
                        
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem;">
                            <div style="background: var(--hover); padding: 0.75rem; border-radius: 0.5rem;">
                                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Train</div>
                                <div style="font-size: 1.25rem; font-weight: 600;">${v.train_count}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${Math.round(v.train_split * 100)}%</div>
                            </div>
                            <div style="background: var(--hover); padding: 0.75rem; border-radius: 0.5rem;">
                                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Validation</div>
                                <div style="font-size: 1.25rem; font-weight: 600;">${v.val_count}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${Math.round(v.val_split * 100)}%</div>
                            </div>
                            <div style="background: var(--hover); padding: 0.75rem; border-radius: 0.5rem;">
                                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Test</div>
                                <div style="font-size: 1.25rem; font-weight: 600;">${v.test_count}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${Math.round(v.test_split * 100)}%</div>
                            </div>
                        </div>
                        
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">
                            Total: ${v.total_images} images • ${v.total_annotations} annotations • Created ${formatDate(v.created_at)}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="useDatasetVersion(${v.id})" title="Train with this version">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Train
                        </button>
                        <button class="btn btn-secondary" onclick="deleteDatasetVersion(${v.id})" style="color: var(--error);" title="Delete version">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        showToast('Failed to load dataset versions', 'error');
    }
}

function setupDatasetSplitListeners() {
    // Wait for DOM to be ready
    setTimeout(() => {
        const trainInput = document.getElementById('trainSplit');
        const valInput = document.getElementById('valSplit');
        const testInput = document.getElementById('testSplit');
        
        if (trainInput && valInput && testInput) {
            const updatePreview = () => {
                const train = parseInt(trainInput.value) || 0;
                const val = parseInt(valInput.value) || 0;
                const test = parseInt(testInput.value) || 0;
                const total = train + val + test;
                
                document.getElementById('splitTotal').textContent = `Total: ${total}%`;
                document.getElementById('splitTotal').style.color = total === 100 ? 'var(--success)' : 'var(--error)';
                
                const annotated = parseInt(document.getElementById('annotatedImagesCount')?.textContent) || 0;
                document.getElementById('previewAnnotated').textContent = annotated;
                document.getElementById('previewTrain').textContent = Math.floor(annotated * train / 100);
                document.getElementById('previewVal').textContent = Math.floor(annotated * val / 100);
                document.getElementById('previewTest').textContent = Math.floor(annotated * test / 100);
            };
            
            trainInput.addEventListener('input', updatePreview);
            valInput.addEventListener('input', updatePreview);
            testInput.addEventListener('input', updatePreview);
            
            updatePreview();
        }
    }, 100);
}

function showCreateDatasetModal() {
    document.getElementById('createDatasetModal').classList.add('active');
    setupDatasetSplitListeners();
}

function closeCreateDatasetModal() {
    document.getElementById('createDatasetModal').classList.remove('active');
}

async function createDatasetVersion() {
    const name = document.getElementById('datasetVersionName').value.trim();
    const description = document.getElementById('datasetVersionDescription').value.trim();
    const train = parseInt(document.getElementById('trainSplit').value) / 100;
    const val = parseInt(document.getElementById('valSplit').value) / 100;
    const test = parseInt(document.getElementById('testSplit').value) / 100;
    
    if (!name) {
        showToast('Please enter a version name', 'error');
        return;
    }
    
    if (Math.abs(train + val + test - 1.0) > 0.01) {
        showToast('Splits must sum to 100%', 'error');
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/dataset-versions`, {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                train_split: train,
                val_split: val,
                test_split: test
            })
        });
        
        showToast('Dataset version created successfully!', 'success');
        closeCreateDatasetModal();
        await loadDatasetVersions();
        
        // Clear form
        document.getElementById('datasetVersionName').value = '';
        document.getElementById('datasetVersionDescription').value = '';
        
    } catch (error) {
        showToast('Failed to create dataset version', 'error');
    }
}

async function deleteDatasetVersion(versionId) {
    if (!confirm('Delete this dataset version? This cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/dataset-versions/${versionId}`, {
            method: 'DELETE'
        });
        
        showToast('Dataset version deleted', 'success');
        await loadDatasetVersions();
        
    } catch (error) {
        showToast(error.message || 'Failed to delete dataset version', 'error');
    }
}

function useDatasetVersion(versionId) {
    // Navigate to training page with version pre-selected
    location.href = `/training/${PROJECT_ID}?version=${versionId}`;
}

function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tabName}Tab`).classList.add('active');
        });
    });
}

function viewBatch(batchId) {
    // Navigate to annotation interface with this batch
    location.href = `/annotate/${PROJECT_ID}?batch=${batchId}`;
}

function showUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
}

function setupUploadArea() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border)';
        handleFiles(e.dataTransfer.files);
    });
}

async function handleFiles(files) {
    const formData = new FormData();
    
    for (let file of files) {
        formData.append('files', file);
    }
    
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadStatus = document.getElementById('uploadStatus');
    const progressFill = document.getElementById('progressFill');
    
    uploadProgress.style.display = 'block';
    
    try {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                progressFill.style.width = percent + '%';
                uploadStatus.textContent = `Uploading... ${Math.round(percent)}%`;
            }
        });
        
        xhr.addEventListener('load', async () => {
            if (xhr.status === 201) {
                const result = JSON.parse(xhr.responseText);
                showToast(`Uploaded ${result.images.length} images successfully!`, 'success');
                closeUploadModal();
                await loadImages();
                
                // Reset
                uploadProgress.style.display = 'none';
                progressFill.style.width = '0%';
                document.getElementById('fileInput').value = '';
            } else {
                showToast('Upload failed', 'error');
            }
        });
        
        xhr.open('POST', `/api/projects/${PROJECT_ID}/upload`);
        xhr.send(formData);
        
    } catch (error) {
        showToast('Upload failed', 'error');
        uploadProgress.style.display = 'none';
    }
}

function showAddClassModal() {
    document.getElementById('addClassModal').classList.add('active');
}

function closeAddClassModal() {
    document.getElementById('addClassModal').classList.remove('active');
}

async function addNewClass() {
    const name = document.getElementById('newClassName').value.trim();
    const color = document.getElementById('newClassColor').value;
    
    if (!name) {
        showToast('Please enter a class name', 'error');
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/classes`, {
            method: 'POST',
            body: JSON.stringify({ name, color })
        });
        
        showToast('Class added successfully!', 'success');
        closeAddClassModal();
        await loadClasses();
        
        document.getElementById('newClassName').value = '';
        
    } catch (error) {
        showToast('Failed to add class', 'error');
    }
}

async function loadTrainedModels() {
    try {
        const projectData = await apiCall(`/api/projects/${PROJECT_ID}`);
        const models = projectData.training_jobs || [];
        const customModels = projectData.custom_models || [];
        
        const versionsList = document.getElementById('versionsList');
        
        const completedModels = models.filter(m => m.status === 'completed' && m.model_path);
        
        if (completedModels.length === 0 && customModels.length === 0) {
            versionsList.innerHTML = '<p class="empty-state">No models yet. Train a model or upload a custom one!</p>';
            return;
        }
        
        let html = '';
        
        // Show trained models
        if (completedModels.length > 0) {
            html += '<h4 style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem; text-transform: uppercase;">🎓 Trained Models</h4>';
            html += completedModels.map(model => {
                const modelSizeLabel = {
                    'n': 'Nano',
                    's': 'Small',
                    'm': 'Medium',
                    'l': 'Large',
                    'x': 'X-Large'
                }[model.model_size || 'n'];
                
                return `
                    <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <h4 style="font-size: 1.125rem; margin-bottom: 0.5rem;">${model.name || `Model #${model.id}`}</h4>
                                <div style="display: flex; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                                    <span style="font-size: 0.875rem; color: var(--text-secondary);">📏 ${modelSizeLabel}</span>
                                    <span style="font-size: 0.875rem; color: var(--text-secondary);">🔁 ${model.epochs} epochs</span>
                                    <span style="font-size: 0.875rem; color: var(--text-secondary);">📦 Batch ${model.batch_size}</span>
                                    <span style="font-size: 0.875rem; color: var(--text-secondary);">🖼️ ${model.image_size}px</span>
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                    Completed ${formatDate(model.completed_at)}
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-secondary" onclick="viewTrainingDetails(${model.id})" title="View training details">
                                    📊 Details
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Show custom models
        if (customModels.length > 0) {
            html += '<h4 style="font-size: 0.875rem; color: var(--text-secondary); margin: 1.5rem 0 1rem 0; text-transform: uppercase;">📤 Custom Uploaded Models</h4>';
            html += customModels.map(model => `
                <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h4 style="font-size: 1.125rem; margin-bottom: 0.5rem;">${model.name}</h4>
                            ${model.description ? `<p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">${model.description}</p>` : ''}
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                Uploaded ${formatDate(model.created_at)} • ${model.file_size || 'Unknown size'}
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="deleteCustomModel(${model.id})" style="color: var(--error);" title="Delete model">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        versionsList.innerHTML = html;
        
    } catch (error) {
        console.error('Failed to load trained models:', error);
    }
}

function viewTrainingDetails(jobId) {
    location.href = `/training/${PROJECT_ID}?job=${jobId}`;
}

function showUploadModelModal() {
    document.getElementById('uploadModelModal').classList.add('active');
}

function closeUploadModelModal() {
    document.getElementById('uploadModelModal').classList.remove('active');
    document.getElementById('customModelName').value = '';
    document.getElementById('customModelDescription').value = '';
    document.getElementById('customModelFile').value = '';
    document.getElementById('uploadModelProgress').style.display = 'none';
}

async function uploadCustomModel() {
    const name = document.getElementById('customModelName').value.trim();
    const description = document.getElementById('customModelDescription').value.trim();
    const fileInput = document.getElementById('customModelFile');
    const file = fileInput.files[0];
    
    if (!name) {
        showToast('Please enter a model name', 'error');
        return;
    }
    
    if (!file) {
        showToast('Please select a model file', 'error');
        return;
    }
    
    if (!file.name.endsWith('.pt')) {
        showToast('Please select a .pt file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('model_file', file);
    
    const uploadProgress = document.getElementById('uploadModelProgress');
    const uploadStatus = document.getElementById('uploadModelStatus');
    const progressFill = document.getElementById('modelProgressFill');
    
    uploadProgress.style.display = 'block';
    uploadStatus.textContent = 'Uploading model...';
    progressFill.style.width = '50%';
    
    try {
        const result = await fetch(`/api/projects/${PROJECT_ID}/custom-models`, {
            method: 'POST',
            body: formData
        });
        
        if (!result.ok) {
            const error = await result.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        progressFill.style.width = '100%';
        uploadStatus.textContent = 'Upload complete!';
        
        showToast('Custom model uploaded successfully!', 'success');
        closeUploadModelModal();
        await loadTrainedModels();
        
    } catch (error) {
        uploadStatus.textContent = 'Upload failed: ' + error.message;
        showToast('Failed to upload model: ' + error.message, 'error');
    }
}

async function deleteCustomModel(modelId) {
    if (!confirm('Delete this custom model? This cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/custom-models/${modelId}`, {
            method: 'DELETE'
        });
        
        showToast('Custom model deleted', 'success');
        await loadTrainedModels();
        
    } catch (error) {
        showToast(error.message || 'Failed to delete model', 'error');
    }
}

function formatDate(dateString) {
    if (!dateString) return 'unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
}

