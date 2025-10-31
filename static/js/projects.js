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

