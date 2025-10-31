// Projects page functionality

let projects = [];

// Load projects on page load
document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    
    // Setup event listeners for buttons
    const newProjectBtn = document.getElementById('newProjectBtn');
    const closeProjectModalBtn = document.getElementById('closeProjectModalBtn');
    const cancelProjectBtn = document.getElementById('cancelProjectBtn');
    const createProjectBtn = document.getElementById('createProjectBtn');
    const searchInput = document.getElementById('searchProjects');
    const sortSelect = document.getElementById('sortBy');
    
    if (newProjectBtn) newProjectBtn.addEventListener('click', showCreateProject);
    if (closeProjectModalBtn) closeProjectModalBtn.addEventListener('click', closeCreateProject);
    if (cancelProjectBtn) cancelProjectBtn.addEventListener('click', closeCreateProject);
    if (createProjectBtn) createProjectBtn.addEventListener('click', createProject);
    if (searchInput) searchInput.addEventListener('input', filterProjects);
    if (sortSelect) sortSelect.addEventListener('change', loadProjects);
    
    // Setup add class button
    const addClassBtn = document.getElementById('addClassBtn');
    if (addClassBtn) addClassBtn.addEventListener('click', addClass);
    
    // Setup remove button for default class item
    const defaultRemoveBtn = document.querySelector('#classesList .remove-class-btn');
    if (defaultRemoveBtn) {
        defaultRemoveBtn.addEventListener('click', () => {
            defaultRemoveBtn.parentElement.remove();
        });
    }
    
    // Setup export/import buttons
    const exportProjectBtn = document.getElementById('exportProjectBtn');
    const importProjectBtn = document.getElementById('importProjectBtn');
    const closeExportModalBtn = document.getElementById('closeExportModalBtn');
    const cancelExportBtn = document.getElementById('cancelExportBtn');
    const confirmExportBtn = document.getElementById('confirmExportBtn');
    const closeImportModalBtn = document.getElementById('closeImportModalBtn');
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    const selectAllProjects = document.getElementById('selectAllProjects');
    
    if (exportProjectBtn) exportProjectBtn.addEventListener('click', showExportModal);
    if (importProjectBtn) importProjectBtn.addEventListener('click', showImportModal);
    if (closeExportModalBtn) closeExportModalBtn.addEventListener('click', closeExportModal);
    if (cancelExportBtn) cancelExportBtn.addEventListener('click', closeExportModal);
    if (confirmExportBtn) confirmExportBtn.addEventListener('click', exportSelectedProjects);
    if (closeImportModalBtn) closeImportModalBtn.addEventListener('click', closeImportModal);
    if (cancelImportBtn) cancelImportBtn.addEventListener('click', closeImportModal);
    if (confirmImportBtn) confirmImportBtn.addEventListener('click', importProjects);
    if (selectAllProjects) selectAllProjects.addEventListener('change', toggleSelectAllProjects);
});

async function loadProjects() {
    try {
        projects = await apiCall('/api/projects');
        displayProjects(projects);
    } catch (error) {
        showToast('Failed to load projects', 'error');
    }
}

function displayProjects(projectsToShow) {
    const grid = document.getElementById('projectsGrid');
    
    if (projectsToShow.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <p style="color: var(--text-secondary); font-size: 1.125rem;">No projects yet. Create your first project!</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = projectsToShow.map(project => `
        <div class="project-card" data-project-id="${project.id}" style="cursor: pointer;">
            <div class="project-thumbnail">
                <img src="/api/projects/${project.id}/thumbnail" 
                     alt="${project.name}" 
                     style="width: 100%; height: 100%; object-fit: cover;"
                     onerror="this.parentElement.innerHTML='📊'">
            </div>
            <div class="project-info">
                <span class="project-type-badge">Object Detection</span>
                <div class="project-name">${project.name}</div>
                <div class="project-stats">
                    <span>• ${project.image_count} Images</span>
                    <span>• ${project.annotated_count} Annotated</span>
                </div>
                <div class="project-meta">
                    Edited ${formatDate(project.updated_at)}
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click handlers to project cards
    grid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => {
            const projectId = card.dataset.projectId;
            location.href = `/project/${projectId}`;
        });
    });
}

function filterProjects() {
    const searchTerm = document.getElementById('searchProjects').value.toLowerCase();
    const filtered = projects.filter(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        (p.annotation_group && p.annotation_group.toLowerCase().includes(searchTerm))
    );
    displayProjects(filtered);
}

function showCreateProject() {
    document.getElementById('createProjectModal').classList.add('active');
}

function closeCreateProject() {
    document.getElementById('createProjectModal').classList.remove('active');
}

// Project type selection
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.project-type-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.project-type-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });
    });
});

function addClass() {
    const classList = document.getElementById('classesList');
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const classItem = document.createElement('div');
    classItem.className = 'class-item';
    classItem.innerHTML = `
        <input type="text" class="class-name-input" placeholder="Class name">
        <input type="color" class="class-color-input" value="${randomColor}">
        <button class="btn-icon remove-class-btn">✕</button>
    `;
    
    // Add event listener to remove button
    const removeBtn = classItem.querySelector('.remove-class-btn');
    removeBtn.addEventListener('click', () => classItem.remove());
    
    classList.appendChild(classItem);
}

async function createProject() {
    const name = document.getElementById('projectName').value.trim();
    const annotationGroup = document.getElementById('annotationGroup').value.trim();
    
    if (!name) {
        showToast('Please enter a project name', 'error');
        return;
    }
    
    const projectType = document.querySelector('.project-type-card.active').dataset.type;
    
    // Get classes
    const classItems = document.querySelectorAll('#classesList .class-item');
    const classes = Array.from(classItems).map(item => ({
        name: item.querySelector('.class-name-input').value.trim(),
        color: item.querySelector('.class-color-input').value
    })).filter(cls => cls.name);
    
    if (classes.length === 0) {
        showToast('Please add at least one class', 'error');
        return;
    }
    
    try {
        const result = await apiCall('/api/projects', {
            method: 'POST',
            body: JSON.stringify({
                name,
                annotation_group: annotationGroup,
                project_type: projectType,
                classes
            })
        });
        
        showToast('Project created successfully!', 'success');
        closeCreateProject();
        
        // Navigate to the new project
        setTimeout(() => {
            location.href = `/project/${result.id}`;
        }, 500);
        
    } catch (error) {
        showToast('Failed to create project', 'error');
    }
}

// ==================== EXPORT/IMPORT FUNCTIONALITY ====================

function showExportModal() {
    const modal = document.getElementById('exportProjectModal');
    const projectsList = document.getElementById('exportProjectsList');
    
    if (projects.length === 0) {
        showToast('No projects to export', 'error');
        return;
    }
    
    // Populate projects list with checkboxes
    projectsList.innerHTML = projects.map(project => `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer; border-radius: 4px; transition: background 0.2s;"
               onmouseover="this.style.background='var(--bg-secondary)'" 
               onmouseout="this.style.background='transparent'">
            <input type="checkbox" class="export-project-checkbox" value="${project.id}" style="width: auto;">
            <div>
                <div style="font-weight: 600;">${project.name}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">
                    ${project.image_count} images • ${project.annotated_count} annotated
                </div>
            </div>
        </label>
    `).join('');
    
    modal.classList.add('active');
}

function closeExportModal() {
    document.getElementById('exportProjectModal').classList.remove('active');
    document.getElementById('selectAllProjects').checked = false;
}

function toggleSelectAllProjects(e) {
    const checkboxes = document.querySelectorAll('.export-project-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
}

async function exportSelectedProjects() {
    const checkboxes = document.querySelectorAll('.export-project-checkbox:checked');
    const projectIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (projectIds.length === 0) {
        showToast('Please select at least one project to export', 'error');
        return;
    }
    
    try {
        showToast(`Exporting ${projectIds.length} project(s)...`, 'info');
        
        // Create a form to submit
        const response = await fetch('/api/export-projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ project_ids: projectIds })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
        
        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'freeflow_export.zip';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Export completed successfully!', 'success');
        closeExportModal();
        
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

function showImportModal() {
    document.getElementById('importProjectModal').classList.add('active');
    document.getElementById('importProgress').style.display = 'none';
    document.getElementById('importFileInput').value = '';
}

function closeImportModal() {
    document.getElementById('importProjectModal').classList.remove('active');
}

async function importProjects() {
    const fileInput = document.getElementById('importFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file to import', 'error');
        return;
    }
    
    if (!file.name.endsWith('.zip')) {
        showToast('Please select a valid zip file', 'error');
        return;
    }
    
    const progressDiv = document.getElementById('importProgress');
    const progressFill = document.getElementById('importProgressFill');
    const statusText = document.getElementById('importStatus');
    
    progressDiv.style.display = 'block';
    progressFill.style.width = '10%';
    statusText.textContent = 'Uploading file...';
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('merge_strategy', 'rename');
        
        progressFill.style.width = '30%';
        statusText.textContent = 'Processing import...';
        
        const response = await fetch('/api/import-projects', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.errors ? result.errors.join('\n') : 'Import failed');
        }
        
        progressFill.style.width = '100%';
        statusText.textContent = 'Import complete!';
        
        showToast(`Successfully imported ${result.projects_imported.length} project(s)!`, 'success');
        
        // Reload projects after a short delay
        setTimeout(() => {
            closeImportModal();
            loadProjects();
        }, 1500);
        
    } catch (error) {
        console.error('Import error:', error);
        statusText.textContent = 'Import failed: ' + error.message;
        statusText.style.color = 'var(--error-color)';
        showToast('Import failed: ' + error.message, 'error');
    }
}

