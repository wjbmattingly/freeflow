# Dataset Versioning Guide

## Overview

Dataset versioning in FreeFlow allows you to create **reproducible snapshots** of your training data with custom train/validation/test splits. This is essential for:

- **Reproducibility** - Ensure the same data split is used across multiple training runs
- **Experimentation** - Compare different split strategies (e.g., 80/10/10 vs 70/20/10)
- **Versioning** - Track which images were used in each model version
- **Collaboration** - Share exact dataset configurations

## Why Use Dataset Versions?

### Without Versioning
- Random shuffling each time you train
- Can't reproduce exact results
- Difficult to compare models fairly
- No tracking of what data was used

### With Versioning
- ✅ Fixed splits across training runs
- ✅ Reproducible experiments
- ✅ Fair model comparisons
- ✅ Audit trail of training data

## Creating a Dataset Version

### Step 1: Navigate to Dataset Versions Tab

1. Open your project
2. Click **"Dataset Versions"** tab
3. Click **"+ Create Version"** button

### Step 2: Configure Your Version

**Version Name** (required)
- Use semantic versioning: `v1.0`, `v1.1`, `v2.0`
- Or descriptive names: `baseline`, `aug_heavy`, `final`
- Examples:
  - `v1.0` - First version
  - `baseline_70_20_10` - Descriptive name with splits
  - `final_production` - Production model version

**Description** (optional)
- Document any special considerations
- Note data quality issues
- Describe augmentation strategies
- Examples:
  - "Initial baseline with all available data"
  - "Removed blurry images, balanced classes"
  - "Production dataset with quality filters"

**Train/Validation/Test Split**
- **Train** - Used for model learning (default: 70%)
- **Validation** - Used for hyperparameter tuning (default: 20%)
- **Test** - Held-out evaluation set (default: 10%)

**Requirements:**
- Must sum to **100%**
- Each split can be 0-100%
- Preview shows exact image counts

### Step 3: Review Preview

The preview shows:
- **Annotated images**: Total images with annotations
- **Train images**: Number in training set
- **Validation images**: Number in validation set
- **Test images**: Number in test set

### Step 4: Create

Click **"Create Version"** to save. The version is immediately available for training!

## Using Dataset Versions

### Method 1: From Dataset Versions Tab

1. Click **"Train"** button on any version card
2. Automatically opens training page with version pre-selected
3. Configure training parameters
4. Click "Start Training"

### Method 2: From Training Page

1. Navigate to **Training** page
2. Select version from **"Dataset Version"** dropdown
3. Configure training parameters
4. Click "Start Training"

### Method 3: Auto-Split (No Version)

1. Navigate to **Training** page
2. Leave **"Dataset Version"** as "Use all annotated images (auto-split 70/20/10)"
3. Training will use all annotated images with random 70/20/10 split

## Common Split Strategies

### 70/20/10 (Default - Balanced)
```
Train: 70%
Val:   20%
Test:  10%
```
- **Best for**: General purpose, balanced evaluation
- **Use when**: You have 100+ annotated images

### 80/10/10 (More Training Data)
```
Train: 80%
Val:   10%
Test:  10%
```
- **Best for**: When you need maximum training data
- **Use when**: You have 50-100 images

### 60/20/20 (Research)
```
Train: 60%
Val:   20%
Test:  20%
```
- **Best for**: Academic research, robust evaluation
- **Use when**: You have 200+ images

### 85/15/0 (No Test Set)
```
Train: 85%
Val:   15%
Test:  0%
```
- **Best for**: Quick experiments, model selection
- **Use when**: You plan to validate externally

### 50/25/25 (Small Dataset)
```
Train: 50%
Val:   25%
Test:  25%
```
- **Best for**: Very small datasets (<50 images)
- **Use when**: You need strong evaluation guarantees

## Version Management

### Viewing Versions

Each version card shows:
- **Name** and **Description**
- **Split statistics** (train/val/test counts and percentages)
- **Total images** and **annotations**
- **Created date**

### Training with a Version

Click the **"Train"** button on any version card to:
1. Navigate to training page
2. Pre-select that version
3. Start training immediately

### Deleting Versions

Click the **trash icon** to delete a version.

**Important**: Cannot delete versions that have associated training jobs.

## Best Practices

### Naming Conventions

1. **Semantic Versioning**
   ```
   v1.0 → Initial version
   v1.1 → Minor improvements
   v2.0 → Major data changes
   ```

2. **Descriptive Names**
   ```
   baseline_all_data
   filtered_high_quality
   production_v1
   experiment_aug_heavy
   ```

3. **Date-Based**
   ```
   2025_01_15_baseline
   2025_01_20_cleaned
   ```

### When to Create New Versions

✅ **Do create a new version when:**
- Starting a new round of experiments
- Making significant data changes
- Preparing for production deployment
- Comparing different split strategies
- Before major annotations changes

❌ **Don't create unnecessary versions for:**
- Every single training run
- Minor annotation corrections
- Testing different hyperparameters (same data)

### Reproducibility Tips

1. **Version your data before major training runs**
2. **Document what changed** in the description
3. **Keep versions used for production models**
4. **Delete old experimental versions** to stay organized

### Comparison Workflow

To compare split strategies:

```
1. Create v1.0 with 70/20/10
2. Train model → Note mAP
3. Create v1.1 with 80/10/10 (same data, different split)
4. Train model → Note mAP
5. Compare results
```

## Integration with Training

### Training with Versioned Data

When you train with a dataset version:
- **Fixed splits**: Same images in train/val/test every time
- **Reproducible**: Exact same results with same hyperparameters
- **Traceable**: Training job remembers which version was used

### Training without Versioned Data

When you train without selecting a version:
- **Random split**: New shuffling each time (70/20/10)
- **Quick experiments**: Good for rapid iteration
- **Less reproducible**: Cannot guarantee exact same split

## FAQ

**Q: Do I need to create versions?**  
A: No! You can train without versions using auto-split. Versions are for reproducibility.

**Q: Can I change a version after creation?**  
A: No, versions are immutable snapshots. Create a new version instead.

**Q: What happens if I annotate more images?**  
A: Existing versions are unchanged. Create a new version to include new annotations.

**Q: Can I use the same images in multiple versions?**  
A: Yes! Different versions can use the same images with different splits.

**Q: How many versions should I keep?**  
A: Keep versions used in production and recent experiments. Delete old test versions.

**Q: What if I delete images?**  
A: Existing versions may reference deleted images. Training will skip missing images.

**Q: Can I export a version?**  
A: Not yet, but you can see which images are in each split via the API.

## Example Workflow

### Scenario: Building a Production Model

```
1. Upload 500 images
2. Annotate all images
3. Create "v1.0_initial_70_20_10"
   - Train/Val/Test: 70/20/10
   - Description: "Initial baseline with all data"
4. Train model → mAP: 0.72
5. Review predictions, fix annotation errors
6. Create "v1.1_cleaned_70_20_10"
   - Same split percentages
   - Description: "Fixed annotation errors from v1.0"
7. Train model → mAP: 0.78 (better!)
8. Add 200 more images, annotate
9. Create "v2.0_expanded_75_15_10"
   - Train/Val/Test: 75/15/10 (more training data)
   - Description: "Added 200 new samples, adjusted split"
10. Train model → mAP: 0.85 (production ready!)
11. Mark "v2.0_expanded_75_15_10" as production version
```

## Technical Details

### Data Storage

- Versions store **image IDs**, not copies of images
- Minimal database overhead
- Fast version creation

### Shuffling

- Images are shuffled randomly when creating a version
- Shuffle is preserved in the version
- Same version = same order

### Training Integration

- Training jobs reference the version ID
- Prevents accidental deletion of versions in use
- Enables training audit trail

---

**Pro Tip**: Start with the default 70/20/10 split for your first version. Adjust based on model performance and dataset size.

Happy versioning! 🚀

