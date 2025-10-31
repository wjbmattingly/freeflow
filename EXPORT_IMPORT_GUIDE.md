# Export/Import Guide

## Overview

FreeFlow now includes comprehensive export and import functionality that allows you to:
- **Export** one or multiple projects as a single zip file
- **Import** previously exported projects with all their data
- Backup and restore your projects
- Share projects between different FreeFlow instances

## What Gets Exported?

When you export a project, the following data is included:

### Database Records
- Project metadata (name, type, settings)
- All classes with colors
- Image metadata
- All annotations (bounding boxes, polygons)
- Dataset versions with train/val/test splits
- Training job configurations and metrics
- Custom model metadata

### Files
- Original uploaded images
- Project thumbnails
- Generated YOLO datasets
- Trained model weights (`best.pt`, `last.pt`)
- Training outputs (results.csv, confusion matrices, etc.)
- Custom uploaded models (.pt files)

## Export Format

The exported zip file has the following structure:

```
freeflow_export_<project_name>_<timestamp>.zip
├── manifest.json              # Database records in JSON format
└── files/
    └── project_<id>/
        ├── images/            # Original uploaded images
        ├── thumbnail/         # Project thumbnail
        ├── datasets/          # YOLO format datasets
        │   └── job_<id>/
        │       ├── data.yaml
        │       ├── train/
        │       ├── val/
        │       └── test/
        ├── training_runs/     # Training outputs
        │   └── job_<id>/
        │       ├── weights/
        │       │   ├── best.pt
        │       │   └── last.pt
        │       ├── results.csv
        │       └── ...
        └── custom_models/     # Custom uploaded models
```

## How to Use

### Exporting Projects

1. **From the Projects Page:**
   - Click the **📤 Export** button in the header
   - A modal will appear showing all your projects
   
2. **Select Projects:**
   - Check the boxes next to the projects you want to export
   - Use "Select All Projects" to export everything
   
3. **Download:**
   - Click **📤 Export Selected**
   - The zip file will download automatically
   - Filename format: `freeflow_export_<project_name>_<timestamp>.zip`

### Importing Projects

1. **From the Projects Page:**
   - Click the **📥 Import** button in the header
   
2. **Select File:**
   - Choose a previously exported zip file
   - Only `.zip` files are accepted
   
3. **Import:**
   - Click **📥 Import Projects**
   - Wait for the upload and processing to complete
   - Progress will be shown during the import
   
4. **Result:**
   - Imported projects will appear in your projects list
   - Names will have "(Imported YYYY-MM-DD HH:MM)" suffix
   - All data, annotations, and models are preserved

## Import Behavior

### ID Handling
- Projects are imported with **new IDs** to avoid conflicts
- All foreign key relationships are automatically remapped
- Original IDs are preserved in the export for reference

### Name Conflicts
- Imported projects are automatically renamed with "(Imported)" suffix
- This prevents confusion with existing projects
- You can rename them after import

### File Paths
- All file paths are updated to match new project IDs
- Images are copied to `uploads/<new_project_id>/`
- Training runs are copied to `training_runs/<new_project_id>/`
- Custom models are copied to `uploads/custom_models/<new_project_id>/`

## API Endpoints

### Export Projects
```bash
POST /api/export-projects
Content-Type: application/json

{
  "project_ids": [1, 2, 3]
}

Response: application/zip (file download)
```

### Import Projects
```bash
POST /api/import-projects
Content-Type: multipart/form-data

file: <zip file>
merge_strategy: "rename" (default)

Response:
{
  "success": true,
  "projects_imported": [
    {
      "old_id": 1,
      "new_id": 5,
      "name": "My Project (Imported 2025-10-31 12:34)"
    }
  ],
  "errors": []
}
```

## Use Cases

### 1. Backup and Restore
Export all projects regularly to create backups. If something goes wrong, you can import them back.

### 2. Project Sharing
Export a project and share the zip file with colleagues. They can import it into their FreeFlow instance.

### 3. Migration
Moving to a new server or computer? Export all projects from the old instance and import them into the new one.

### 4. Project Templates
Create a well-configured project with classes and settings, export it, and use it as a template for new projects.

### 5. Archiving
Export completed projects and remove them from your active workspace to keep things organized.

## Troubleshooting

### Export Issues

**Problem:** Export button is disabled
- **Solution:** Make sure you have at least one project created

**Problem:** Export fails with error
- **Solution:** Check that project files exist on disk. Some older projects may have missing files.

### Import Issues

**Problem:** "Invalid export file" error
- **Solution:** Make sure you're uploading a zip file created by FreeFlow's export function

**Problem:** Import partially succeeds
- **Solution:** Check the error messages in the response. Some files may be missing, but the project structure will still import.

**Problem:** Imported project has fewer images
- **Solution:** Original image files may have been deleted. The database records will import, but missing files will be skipped.

## Technical Details

### Database Schema Preservation
The export/import system preserves the complete database schema:
- All SQLAlchemy model fields are exported
- Relationships are maintained through ID remapping
- Datetime fields are converted to ISO format
- JSON fields (metrics, splits) are preserved

### File Copy Strategy
- Files are copied (not moved) during both export and import
- Original files remain untouched
- Hard links are not used (for compatibility)

### Performance Considerations
- Large projects (>1GB) may take time to export
- Import is slower than export due to database operations
- Progress indicators show current status

## Security Notes

- Exported zip files contain all project data in plain text
- Do not share exports if they contain sensitive information
- Consider encrypting exports before sharing or storing
- No password protection is built into the export format

## Version Compatibility

- Export format version: 1.0
- Exports include version information in manifest.json
- Future versions will maintain backward compatibility
- If incompatibilities arise, migration scripts will be provided

## Best Practices

1. **Regular Backups:** Export important projects weekly
2. **Naming Convention:** Use descriptive names for projects before export
3. **Verify Exports:** After exporting, check the zip file size is reasonable
4. **Test Imports:** Test importing in a development environment first
5. **Clean Up:** Delete old exports after successful imports

## Future Enhancements

Potential features for future versions:
- Selective import (choose which projects from a multi-project export)
- Incremental exports (only changed data)
- Cloud storage integration
- Automatic scheduled backups
- Export compression levels
- Password protection for exports

