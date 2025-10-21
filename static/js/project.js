// Project page functionality

let project = null;
let allImages = [];
let filteredImages = [];
let currentFilter = 'all'; // 'all', 'annotated', 'unannotated'
let classes = [];
let datasetVersions = [];
let currentPage = 1;
let imagesPerPage = 20;
let selectedImages = new Set(); // Track selected image IDs
let socket = null; // SocketIO connection for real-time updates

document.addEventListener('DOMContentLoaded', () => {
    loadProject();
    setupTabs();
    setupUploadArea();
    setupDatasetSplitListeners();
    setupSocketConnection();
});

function setupSocketConnection() {
    // Disconnect existing socket if present
    if (socket) {
        console.log('🔄 Reconnecting socket...');
        socket.removeAllListeners();
        socket.disconnect();
    }
    
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Socket connected for project updates');
    });
    
    socket.on('disconnect', () => {
        console.log('⚠️ Socket disconnected, attempting to reconnect...');
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
    });
    
    socket.on('pdf_processing', (data) => {
        console.log('📨 PDF processing event received:', data);
        if (data.project_id === PROJECT_ID) {
            updateProcessingStatus(data);
        }
    });
}

function updateProcessingStatus(data) {
    console.log('📊 Updating processing status:', data);
    const uploadStatus = document.getElementById('uploadStatus');
    const progressFill = document.getElementById('progressFill');
    const uploadProgress = document.getElementById('uploadProgress');
    
    if (!uploadStatus || !progressFill || !uploadProgress) {
        console.error('❌ Upload modal elements not found!');
        return;
    }
    
    if (data.status === 'processing') {
        uploadProgress.style.display = 'block';
        const percent = (data.current / data.total) * 100;
        progressFill.style.width = percent + '%';
        uploadStatus.textContent = `Processing PDF: ${data.current}/${data.total} pages (resizing & saving...)`;
        console.log(`📄 Processing: ${data.current}/${data.total} (${percent.toFixed(1)}%)`);
    } else if (data.status === 'complete') {
        progressFill.style.width = '100%';
        uploadStatus.textContent = `✅ Processing complete! ${data.total} pages extracted.`;
        console.log(`✅ PDF processing complete: ${data.total} pages`);
        
        // Auto-close after a brief delay and reload images
        setTimeout(async () => {
            console.log('🔄 Closing modal and reloading images...');
            closeUploadModal();
            await loadImages();
            uploadProgress.style.display = 'none';
            progressFill.style.width = '0%';
            document.getElementById('fileInput').value = '';
        }, 1500);
    }
}

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
        const unannotatedCount = totalCount - annotatedCount;
        
        document.getElementById('allImagesCount').textContent = totalCount;
        document.getElementById('annotatedCount').textContent = annotatedCount;
        document.getElementById('unannotatedCount').textContent = unannotatedCount;
        
        // Apply filter and display images grid
        applyFilter();
        displayImagesGrid();
        updateSelectionUI();
        
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

function applyFilter() {
    if (currentFilter === 'all') {
        filteredImages = [...allImages];
    } else if (currentFilter === 'annotated') {
        filteredImages = allImages.filter(img => img.status === 'completed');
    } else if (currentFilter === 'unannotated') {
        filteredImages = allImages.filter(img => img.status !== 'completed');
    }
    currentPage = 1; // Reset to first page when filter changes
}

function filterImages(filter) {
    currentFilter = filter;
    
    // Update sub-tab styling
    document.querySelectorAll('.sub-tab').forEach(tab => {
        const isActive = tab.dataset.filter === filter;
        tab.style.borderBottom = isActive ? '2px solid var(--primary-color)' : '2px solid transparent';
        tab.style.fontWeight = isActive ? '500' : '400';
        tab.style.color = isActive ? 'var(--text)' : 'var(--text-secondary)';
        if (isActive) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    applyFilter();
    displayImagesGrid();
}

function displayImagesGrid() {
    const grid = document.getElementById('imagesGrid');
    
    if (filteredImages.length === 0) {
        const emptyMessage = currentFilter === 'all' ? 'No images uploaded yet' :
                            currentFilter === 'annotated' ? 'No annotated images yet' :
                            'No unannotated images';
        grid.innerHTML = `<p class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 3rem;">${emptyMessage}</p>`;
        document.getElementById('paginationControls').style.display = 'none';
        document.getElementById('totalImagesCount').textContent = '0';
        document.getElementById('showingCount').textContent = '0';
        return;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredImages.length / imagesPerPage);
    const startIdx = (currentPage - 1) * imagesPerPage;
    const endIdx = Math.min(startIdx + imagesPerPage, filteredImages.length);
    const imagesToShow = filteredImages.slice(startIdx, endIdx);
    
    // Update showing count
    document.getElementById('totalImagesCount').textContent = filteredImages.length;
    document.getElementById('showingCount').textContent = imagesToShow.length;
    
    // Render images
    grid.innerHTML = imagesToShow.map(img => `
        <div class="image-card ${img.status === 'completed' ? 'annotated' : ''}" 
             onclick="openAnnotation(${img.id})"
             title="${img.filename}"
             style="position: relative;">
            <!-- Checkbox for selection -->
            <input type="checkbox" 
                   class="image-checkbox" 
                   data-image-id="${img.id}"
                   ${selectedImages.has(img.id) ? 'checked' : ''}
                   onclick="event.stopPropagation(); toggleImageSelection(${img.id})"
                   style="position: absolute; top: 0.5rem; left: 0.5rem; width: 1.25rem; height: 1.25rem; cursor: pointer; z-index: 10;">
            
            <!-- Delete button -->
            <button class="btn-icon" 
                    onclick="event.stopPropagation(); deleteSingleImage(${img.id})"
                    style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(220, 38, 38, 0.9); color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; z-index: 10; border: none;">
                🗑️
            </button>
            
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
    
    // Update select all checkbox state
    updateSelectAllCheckbox();
    
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
    const totalPages = Math.ceil(filteredImages.length / imagesPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayImagesGrid();
        // Scroll to top of images
        document.getElementById('imagesGrid').scrollIntoView({ behavior: 'smooth' });
    }
}

function openAnnotation(imageId) {
    // Pass the current filter to the annotation page
    location.href = `/annotate/${PROJECT_ID}?image=${imageId}&filter=${currentFilter}`;
}

function openAnnotationOld(imageId) {
    // Find the image index in allImages (old function, keeping for reference)
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
        
        if (classes.length === 0) {
            classesListView.innerHTML = '<p class="empty-state">No classes yet. Add your first class!</p>';
            return;
        }
        
        classesListView.innerHTML = `
            <div style="display: grid; grid-template-columns: 80px 1fr 120px; gap: 1rem; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border);">
                <div>Color</div>
                <div>Class Name</div>
                <div style="text-align: right;">Count</div>
            </div>
        ` + classes.map(cls => `
            <div class="class-item" style="display: grid; grid-template-columns: 80px 1fr 120px; gap: 1rem; align-items: center; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-top: none; transition: all 0.2s;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 1rem; height: 1rem; border-radius: 50%; background: ${cls.color};"></div>
                    <input type="color" value="${cls.color}" 
                           onchange="updateClassColor(${cls.id}, this.value)" 
                           style="width: 2rem; height: 2rem; border: 1px solid var(--border); border-radius: 0.375rem; cursor: pointer;">
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-weight: 500; flex: 1;">${cls.name}</span>
                    <button class="btn btn-secondary" onclick="editClass(${cls.id}, '${cls.name}', '${cls.color}')" 
                            style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                        Edit
                    </button>
                    <button class="btn btn-secondary" onclick="deleteClass(${cls.id}, '${cls.name}')" 
                            style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--error);">
                        Delete
                    </button>
                </div>
                <div style="text-align: right; font-weight: 600; color: var(--text);">
                    ${cls.annotation_count || 0}
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 400; margin-top: 0.25rem;">
                        ${cls.image_count || 0} image${cls.image_count === 1 ? '' : 's'}
                    </div>
                </div>
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
                            Total: ${v.total_images} images • ${v.total_annotations} annotations${v.seed !== null ? ` • Seed: ${v.seed}` : ''} • Created ${formatDate(v.created_at)}
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
        let isDragging = false;
        let activeDivider = null;
        
        const container = document.getElementById('splitSliderContainer');
        const divider1 = document.getElementById('divider1');
        const divider2 = document.getElementById('divider2');
        const trainSection = document.getElementById('trainSection');
        const valSection = document.getElementById('valSection');
        const testSection = document.getElementById('testSection');
        
        if (!container || !divider1 || !divider2) return;
        
        const updateSplitDisplay = () => {
            const annotated = parseInt(document.getElementById('annotatedCount')?.textContent) || 0;
            const train = parseInt(document.getElementById('trainSplit').value);
            const val = parseInt(document.getElementById('valSplit').value);
            const test = parseInt(document.getElementById('testSplit').value);
            
            // Update percentages
            document.getElementById('trainPercent').textContent = `${train}%`;
            document.getElementById('valPercent').textContent = `${val}%`;
            document.getElementById('testPercent').textContent = `${test}%`;
            
            // Update image counts
            document.getElementById('trainCount').textContent = `${Math.floor(annotated * train / 100)} images`;
            document.getElementById('valCount').textContent = `${Math.floor(annotated * val / 100)} images`;
            document.getElementById('testCount').textContent = `${Math.floor(annotated * test / 100)} images`;
            
            // Update preview
            document.getElementById('previewAnnotated').textContent = annotated;
            document.getElementById('previewTrain').textContent = Math.floor(annotated * train / 100);
            document.getElementById('previewVal').textContent = Math.floor(annotated * val / 100);
            document.getElementById('previewTest').textContent = Math.floor(annotated * test / 100);
            
            // Update visual sections
            const trainPercent = train;
            const valPercent = val;
            
            trainSection.style.width = `${trainPercent}%`;
            valSection.style.left = `${trainPercent}%`;
            valSection.style.width = `${valPercent}%`;
            testSection.style.left = `${trainPercent + valPercent}%`;
            testSection.style.width = `${test}%`;
            
            divider1.style.left = `${trainPercent}%`;
            divider2.style.left = `${trainPercent + valPercent}%`;
        };
        
        const handleMouseDown = (e, dividerNum) => {
            isDragging = true;
            activeDivider = dividerNum;
            e.preventDefault();
            document.body.style.cursor = 'ew-resize';
        };
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = Math.max(5, Math.min(95, (x / rect.width) * 100)); // Keep between 5% and 95%
            
            if (activeDivider === 1) {
                // Moving train/val divider
                const train = Math.round(percent);
                const currentVal = parseInt(document.getElementById('valSplit').value);
                const currentTest = parseInt(document.getElementById('testSplit').value);
                
                // Ensure train is reasonable (at least 10%)
                if (train < 10 || train > 90) return;
                
                // Adjust val and test to keep total at 100
                const remaining = 100 - train;
                let newVal = Math.min(currentVal, remaining - 5); // Leave at least 5% for test
                let newTest = remaining - newVal;
                
                // Ensure test is at least 5%
                if (newTest < 5) {
                    newTest = 5;
                    newVal = remaining - newTest;
                }
                
                document.getElementById('trainSplit').value = train;
                document.getElementById('valSplit').value = Math.round(newVal);
                document.getElementById('testSplit').value = Math.round(newTest);
            } else if (activeDivider === 2) {
                // Moving val/test divider
                const train = parseInt(document.getElementById('trainSplit').value);
                const valTest = Math.round(percent) - train;
                
                // Ensure we have reasonable splits
                if (valTest < 5 || valTest > (100 - train - 5)) return;
                
                const test = 100 - train - valTest;
                
                document.getElementById('valSplit').value = Math.round(valTest);
                document.getElementById('testSplit').value = Math.round(test);
            }
            
            updateSplitDisplay();
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            activeDivider = null;
            document.body.style.cursor = '';
        };
        
        divider1.addEventListener('mousedown', (e) => handleMouseDown(e, 1));
        divider2.addEventListener('mousedown', (e) => handleMouseDown(e, 2));
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Initial update
        updateSplitDisplay();
        
        // Update when modal is shown (to get annotated count)
        const observer = new MutationObserver(() => {
            if (document.getElementById('createDatasetModal').classList.contains('active')) {
                updateSplitDisplay();
            }
        });
        observer.observe(document.getElementById('createDatasetModal'), { attributes: true });
    }, 100);
}

function showCreateDatasetModal() {
    document.getElementById('createDatasetModal').classList.add('active');
    setupDatasetSplitListeners();
}

function closeCreateDatasetModal() {
    document.getElementById('createDatasetModal').classList.remove('active');
}

function generateRandomSeed() {
    // Generate a random integer between 0 and 999999
    const seed = Math.floor(Math.random() * 1000000);
    document.getElementById('randomSeed').value = seed;
    showToast(`Random seed generated: ${seed}`, 'info');
}

async function createDatasetVersion() {
    const name = document.getElementById('datasetVersionName').value.trim();
    const description = document.getElementById('datasetVersionDescription').value.trim();
    const train = parseInt(document.getElementById('trainSplit').value) / 100;
    const val = parseInt(document.getElementById('valSplit').value) / 100;
    const test = parseInt(document.getElementById('testSplit').value) / 100;
    const seedValue = document.getElementById('randomSeed').value.trim();
    const seed = seedValue ? parseInt(seedValue) : null;
    
    if (!name) {
        showToast('Please enter a version name', 'error');
        return;
    }
    
    if (Math.abs(train + val + test - 1.0) > 0.01) {
        showToast('Splits must sum to 100%', 'error');
        return;
    }
    
    try {
        const payload = {
            name,
            description,
            train_split: train,
            val_split: val,
            test_split: test
        };
        
        // Only include seed if it's set
        if (seed !== null) {
            payload.seed = seed;
        }
        
        await apiCall(`/api/projects/${PROJECT_ID}/dataset-versions`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        showToast('Dataset version created successfully!', 'success');
        closeCreateDatasetModal();
        await loadDatasetVersions();
        
        // Clear form
        document.getElementById('datasetVersionName').value = '';
        document.getElementById('datasetVersionDescription').value = '';
        document.getElementById('randomSeed').value = '';
        
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
            
            // Load settings when settings tab is clicked
            if (tabName === 'settings') {
                loadSettings();
            }
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
    
    // Check if any PDFs are being uploaded
    let hasPDF = false;
    for (let file of files) {
        formData.append('files', file);
        if (file.name.toLowerCase().endsWith('.pdf')) {
            hasPDF = true;
        }
    }
    
    // Ensure socket is connected for PDF processing updates
    if (hasPDF) {
        if (!socket || !socket.connected) {
            console.log('🔌 Socket not connected, reconnecting for PDF processing...');
            setupSocketConnection();
            // Wait a bit for socket to connect
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            console.log('✅ Socket already connected for PDF processing');
        }
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
                
                // If PDF was uploaded, show processing message
                // Socket updates will show real-time progress and close the modal
                if (hasPDF) {
                    uploadStatus.textContent = 'Upload complete! Processing PDF pages...';
                    progressFill.style.width = '0%';
                    // Socket will handle the rest via updateProcessingStatus()
                } else {
                    // No PDF, complete immediately
                    showToast(`Uploaded ${result.images.length} images successfully!`, 'success');
                    closeUploadModal();
                    await loadImages();
                    
                    // Reset
                    uploadProgress.style.display = 'none';
                    progressFill.style.width = '0%';
                    document.getElementById('fileInput').value = '';
                }
            } else if (xhr.status === 413) {
                const response = JSON.parse(xhr.responseText);
                showToast(response.message || 'File too large. Maximum size is 1GB.', 'error');
                uploadProgress.style.display = 'none';
            } else {
                showToast('Upload failed', 'error');
                uploadProgress.style.display = 'none';
            }
        });
        
        xhr.open('POST', `/api/projects/${PROJECT_ID}/upload`);
        xhr.send(formData);
        
    } catch (error) {
        showToast('Upload failed', 'error');
        uploadProgress.style.display = 'none';
    }
}

// ==================== ROBOFLOW IMPORT ====================

function showRoboflowImportModal() {
    document.getElementById('roboflowImportModal').classList.add('active');
}

function closeRoboflowImportModal() {
    const modal = document.getElementById('roboflowImportModal');
    modal.classList.remove('active');
    
    // Reset form
    document.getElementById('roboflowApiKey').value = '';
    document.getElementById('roboflowWorkspace').value = '';
    document.getElementById('roboflowProject').value = '';
    document.getElementById('roboflowVersion').value = '';
    document.getElementById('roboflowImportProgress').style.display = 'none';
    document.getElementById('roboflowProgressBar').style.width = '0%';
}

async function importFromRoboflow() {
    const apiKey = document.getElementById('roboflowApiKey').value.trim();
    const workspace = document.getElementById('roboflowWorkspace').value.trim();
    const projectName = document.getElementById('roboflowProject').value.trim();
    const version = document.getElementById('roboflowVersion').value.trim();
    
    // Validate inputs
    if (!apiKey || !workspace || !projectName || !version) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    // Show progress
    const progressDiv = document.getElementById('roboflowImportProgress');
    const statusText = document.getElementById('roboflowImportStatus');
    const progressBar = document.getElementById('roboflowProgressBar');
    const importBtn = document.getElementById('roboflowImportBtn');
    
    progressDiv.style.display = 'block';
    statusText.textContent = 'Connecting to Roboflow...';
    progressBar.style.width = '10%';
    importBtn.disabled = true;
    
    try {
        // Simulate progress updates
        setTimeout(() => {
            statusText.textContent = 'Downloading dataset...';
            progressBar.style.width = '30%';
        }, 500);
        
        setTimeout(() => {
            statusText.textContent = 'Processing images and annotations...';
            progressBar.style.width = '60%';
        }, 2000);
        
        const response = await apiCall(`/api/projects/${PROJECT_ID}/import-roboflow`, {
            method: 'POST',
            body: JSON.stringify({
                api_key: apiKey,
                workspace: workspace,
                project_name: projectName,
                version: parseInt(version)
            })
        });
        
        progressBar.style.width = '100%';
        statusText.textContent = 'Import complete!';
        
        showToast(`Successfully imported ${response.images_count} images with ${response.annotations_count} annotations!`, 'success');
        
        // Close modal and reload data
        setTimeout(async () => {
            closeRoboflowImportModal();
            await loadImages();
            await loadClasses();
        }, 1000);
        
    } catch (error) {
        console.error('Import failed:', error);
        showToast(error.message || 'Failed to import dataset from Roboflow', 'error');
        progressDiv.style.display = 'none';
        importBtn.disabled = false;
    }
}

// ==================== HUGGING FACE IMPORT ====================

function showHuggingFaceImportModal() {
    document.getElementById('huggingFaceImportModal').classList.add('active');
}

function closeHuggingFaceImportModal() {
    const modal = document.getElementById('huggingFaceImportModal');
    modal.classList.remove('active');

    // Reset form
    document.getElementById('hfDatasetId').value = '';
    document.getElementById('hfSplit').value = 'train';
    document.getElementById('hfImageColumn').value = 'image';
    document.getElementById('hfSampleSize').value = '';
    document.getElementById('hfImportProgress').style.display = 'none';
    document.getElementById('hfProgressBar').style.width = '0%';
}

async function importFromHuggingFace() {
    const datasetId = document.getElementById('hfDatasetId').value.trim();
    const split = document.getElementById('hfSplit').value;
    const imageColumn = document.getElementById('hfImageColumn').value.trim() || 'image';
    const sampleSize = document.getElementById('hfSampleSize').value.trim();

    // Validate inputs
    if (!datasetId) {
        showToast('Please enter a dataset ID', 'error');
        return;
    }

    // Show progress
    const progressDiv = document.getElementById('hfImportProgress');
    const statusText = document.getElementById('hfImportStatus');
    const progressBar = document.getElementById('hfProgressBar');
    const importBtn = document.getElementById('hfImportBtn');

    progressDiv.style.display = 'block';
    statusText.textContent = 'Loading dataset from Hugging Face...';
    progressBar.style.width = '10%';
    importBtn.disabled = true;

    // Set up socket listener for progress updates
    if (socket) {
        socket.on('hf_import_progress', (data) => {
            if (data.project_id === PROJECT_ID) {
                if (data.status === 'loading') {
                    statusText.textContent = data.message;
                    progressBar.style.width = '20%';
                } else if (data.status === 'importing') {
                    statusText.textContent = data.message;
                    if (data.total) {
                        const percent = Math.min(90, 20 + (data.current / data.total) * 70);
                        progressBar.style.width = percent + '%';
                    }
                } else if (data.status === 'complete') {
                    progressBar.style.width = '100%';
                    statusText.textContent = data.message;
                } else if (data.status === 'error') {
                    showToast(data.message, 'error');
                    progressDiv.style.display = 'none';
                    importBtn.disabled = false;
                }
            }
        });
    }

    try {
        const payload = {
            dataset_id: datasetId,
            split: split,
            image_column: imageColumn
        };

        // Add sample size if provided
        if (sampleSize) {
            const parsedSampleSize = parseInt(sampleSize, 10);
            if (isNaN(parsedSampleSize)) {
                showToast('Sample size must be a valid number', 'error');
                progressDiv.style.display = 'none';
                importBtn.disabled = false;
                return;
            }
            payload.sample_size = parsedSampleSize;
        }

        const response = await apiCall(`/api/projects/${PROJECT_ID}/import-huggingface`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        progressBar.style.width = '100%';
        statusText.textContent = 'Import complete!';

        showToast(`Successfully imported ${response.images_count} images from ${datasetId}!`, 'success');

        // Close modal and reload data
        setTimeout(async () => {
            closeHuggingFaceImportModal();
            await loadImages();

            // Clean up socket listener
            if (socket) {
                socket.off('hf_import_progress');
            }
        }, 1000);

    } catch (error) {
        console.error('Import failed:', error);
        showToast(error.message || 'Failed to import dataset from Hugging Face', 'error');
        progressDiv.style.display = 'none';
        importBtn.disabled = false;

        // Clean up socket listener
        if (socket) {
            socket.off('hf_import_progress');
        }
    }
}

// ==================== CLASS MANAGEMENT ====================

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
                
                const hasTestMetrics = model.test_map50 !== null && model.test_map50 !== undefined;
                
                return `
                    <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
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
                                <button class="btn btn-primary" onclick="downloadModel(${model.id})" title="Download weights">
                                    ⬇️ Download
                                </button>
                                <button class="btn btn-secondary" onclick="deleteTrainedModel(${model.id})" style="color: var(--error);" title="Delete model">
                                    🗑️
                                </button>
                            </div>
                        </div>
                        ${hasTestMetrics ? `
                            <div style="background: rgba(124, 58, 237, 0.05); border: 1px solid rgba(124, 58, 237, 0.2); border-radius: 0.5rem; padding: 1rem;">
                                <h5 style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.75rem;">Test Set Metrics</h5>
                                <div style="display: flex; gap: 2rem;">
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color);">${(model.test_map50 * 100).toFixed(1)}%</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">mAP@50</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color);">${(model.test_precision * 100).toFixed(1)}%</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Precision</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color);">${(model.test_recall * 100).toFixed(1)}%</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Recall</div>
                                    </div>
                                </div>
                            </div>
                        ` : '<p style="font-size: 0.875rem; color: var(--text-secondary); font-style: italic;">Evaluation metrics not available</p>'}
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
    location.href = `/project/${PROJECT_ID}/model/${jobId}`;
}

function downloadModel(jobId) {
    window.location.href = `/api/training/${jobId}/download`;
}

async function deleteTrainedModel(jobId) {
    if (!confirm('Delete this trained model? This will permanently delete the model weights and cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`/api/training/${jobId}`, {
            method: 'DELETE'
        });
        
        showToast('Model deleted successfully', 'success');
        await loadTrainedModels();
        
    } catch (error) {
        showToast(error.message || 'Failed to delete model', 'error');
    }
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

// ==================== SETTINGS TAB ====================

async function loadSettings() {
    // Load current project name
    document.getElementById('projectNameInput').value = project.name;
    
    // Load current thumbnail
    document.getElementById('currentThumbnail').src = `/api/projects/${PROJECT_ID}/thumbnail`;
    document.getElementById('currentThumbnail').onerror = function() {
        this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="%23eee" width="200" height="200"/><text x="50%" y="50%" text-anchor="middle" fill="%23999" font-size="16">No thumbnail</text></svg>';
    };
}

async function updateProjectName() {
    const newName = document.getElementById('projectNameInput').value.trim();
    if (!newName) {
        showToast('Please enter a project name', 'error');
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        });
        
        project.name = newName;
        document.getElementById('projectName').textContent = newName;
        document.title = `${newName} - FreeFlow`;
        showToast('Project name updated successfully', 'success');
    } catch (error) {
        showToast('Failed to update project name', 'error');
    }
}

async function showThumbnailSelector() {
    const selector = document.getElementById('thumbnailSelector');
    
    if (selector.style.display === 'none') {
        // Load all images
        const grid = document.getElementById('thumbnailGridSelector');
        grid.innerHTML = allImages.map(img => `
            <div onclick="selectThumbnailImage(${img.id})" style="cursor: pointer; border: 2px solid var(--border); border-radius: 0.5rem; overflow: hidden; transition: all 0.2s; position: relative;" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='var(--border)'">
                <img src="/api/images/${img.id}" style="width: 100%; height: 120px; object-fit: cover; display: block;">
                <div style="position: absolute; top: 0.25rem; right: 0.25rem; background: var(--primary-color); color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; display: none;" id="selected-${img.id}">✓</div>
            </div>
        `).join('');
        
        selector.style.display = 'block';
    } else {
        selector.style.display = 'none';
    }
}

async function selectThumbnailImage(imageId) {
    try {
        await apiCall(`/api/projects/${PROJECT_ID}`, {
            method: 'PUT',
            body: JSON.stringify({ thumbnail_image_id: imageId })
        });
        
        // Update preview
        document.getElementById('currentThumbnail').src = `/api/images/${imageId}`;
        
        // Hide selector
        document.getElementById('thumbnailSelector').style.display = 'none';
        
        showToast('Thumbnail updated successfully', 'success');
    } catch (error) {
        showToast('Failed to update thumbnail', 'error');
    }
}

async function uploadCustomThumbnail() {
    const fileInput = document.getElementById('customThumbnailInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`/api/projects/${PROJECT_ID}/thumbnail`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        // Update preview
        document.getElementById('currentThumbnail').src = `/api/projects/${PROJECT_ID}/thumbnail?t=${Date.now()}`;
        
        showToast('Custom thumbnail uploaded successfully', 'success');
        fileInput.value = '';
    } catch (error) {
        showToast('Failed to upload thumbnail', 'error');
    }
}

// ==================== IMAGE SELECTION & DELETION ====================

function toggleImageSelection(imageId) {
    if (selectedImages.has(imageId)) {
        selectedImages.delete(imageId);
    } else {
        selectedImages.add(imageId);
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllImages');
    
    if (selectAllCheckbox.checked) {
        // Select all visible images
        filteredImages.forEach(img => selectedImages.add(img.id));
    } else {
        // Deselect all
        selectedImages.clear();
    }
    
    displayImagesGrid();
    updateSelectionUI();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllImages');
    const visibleImageIds = filteredImages.map(img => img.id);
    const allVisibleSelected = visibleImageIds.length > 0 && 
                                visibleImageIds.every(id => selectedImages.has(id));
    
    selectAllCheckbox.checked = allVisibleSelected;
}

function updateSelectionUI() {
    const count = selectedImages.size;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('deleteSelectedBtn').style.display = count > 0 ? 'block' : 'none';
}

function deleteSingleImage(imageId) {
    selectedImages.clear();
    selectedImages.add(imageId);
    deleteSelectedImages();
}

function deleteSelectedImages() {
    if (selectedImages.size === 0) {
        showToast('No images selected', 'error');
        return;
    }
    
    document.getElementById('deleteImagesCount').textContent = selectedImages.size;
    document.getElementById('deleteImagesModal').classList.add('active');
}

function closeDeleteImagesModal() {
    document.getElementById('deleteImagesModal').classList.remove('active');
}

async function confirmDeleteImages() {
    const imageIds = Array.from(selectedImages);
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}/images/delete`, {
            method: 'POST',
            body: JSON.stringify({ image_ids: imageIds })
        });
        
        showToast(`Successfully deleted ${imageIds.length} image(s)`, 'success');
        selectedImages.clear();
        closeDeleteImagesModal();
        await loadImages(); // Reload images
        
    } catch (error) {
        showToast('Failed to delete images', 'error');
    }
}

// ==================== PROJECT DELETION ====================

function showDeleteProjectModal() {
    document.getElementById('deleteProjectConfirm').value = '';
    document.getElementById('deleteProjectModal').classList.add('active');
}

function closeDeleteProjectModal() {
    document.getElementById('deleteProjectModal').classList.remove('active');
}

async function confirmDeleteProject() {
    const confirmInput = document.getElementById('deleteProjectConfirm').value.trim();
    
    if (confirmInput !== project.name) {
        showToast('Project name does not match. Please type the exact project name to confirm.', 'error');
        return;
    }
    
    try {
        await apiCall(`/api/projects/${PROJECT_ID}`, {
            method: 'DELETE'
        });
        
        showToast('Project deleted successfully', 'success');
        
        // Redirect to homepage after short delay
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
        
    } catch (error) {
        showToast('Failed to delete project', 'error');
    }
}

