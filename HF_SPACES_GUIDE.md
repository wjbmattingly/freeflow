# Running FreeFlow in Hugging Face Spaces

## Overview

FreeFlow can run as a Hugging Face Space and use HF Jobs for training with automatic authentication.

## Setup

### 1. Create a Space

1. Go to https://huggingface.co/new-space
2. Choose **Docker** as the SDK
3. Set the Space to **Private** if needed
4. Clone the repository to your Space

### 2. Configure Space Settings

Your Space needs access to HF Jobs. Make sure:

1. The Space has a **HF Token** (automatically provided by HF)
2. The token has **Jobs** permissions
3. The Space is set to use Docker

### 3. Dockerfile

The provided `Dockerfile` is already configured for Spaces. It will:
- Install all dependencies
- Set up the Flask app
- Run on port 7860 (HF Spaces default)

## Authentication

### Automatic in Spaces

When running in a Hugging Face Space:
- ✅ **No credentials needed** - Uses the Space's token automatically
- ✅ Username/API key fields are **hidden**
- ✅ Shows info message: "Running in Hugging Face Space"
- ✅ Authentication handled transparently

### Manual (Local Development)

When running locally:
- ❌ **Credentials required** - Must enter HF username and API key
- 📝 Credentials are **cached** in browser localStorage
- 🔒 Kept private to your browser

## How It Works

### Detection

The app detects if it's running in a Space by checking:
```javascript
const isSpace = window.location.hostname.includes('hf.space') || 
                window.location.hostname.includes('huggingface.co');
```

### Backend

```python
# Check if running in Space
is_space = 'SPACE_ID' in os.environ

if is_space:
    # Use Space's token
    hf_api_key = os.environ.get('HF_TOKEN')
    hf_username = os.environ.get('SPACE_AUTHOR', 'user')
```

### Frontend

- Hides username/API key fields
- Shows info message about automatic authentication
- Sends placeholder values (backend ignores them)

## Environment Variables

When running in a Space, these are automatically set:

- `SPACE_ID` - The Space identifier
- `SPACE_AUTHOR` - The Space owner's username
- `HF_TOKEN` - The Space's authentication token

## Training on HF Jobs

### From a Space

1. Open your Space URL
2. Create/upload a project
3. Annotate images
4. Go to Training page
5. Select "Hugging Face Jobs" as training location
6. **No credentials needed!** Just select hardware
7. Click "Start Training"

The training will:
- ✅ Use the Space's token
- ✅ Upload dataset to HF Hub (private)
- ✅ Run training on HF Jobs
- ✅ Upload model to HF Hub (private)
- ✅ Download results back to Space

### Hardware Options

Available in Spaces (same as local):
- **CPU**: cpu-basic, cpu-upgrade
- **GPU**: t4-small, t4-medium, l4x1, l4x4, a10g-small, a10g-large, etc.
- **TPU**: v5e-1x1, v5e-2x2, v5e-2x4

## Limitations

### Spaces vs Local

| Feature | Local | Spaces |
|---------|-------|--------|
| HF Jobs Training | ✅ (with API key) | ✅ (automatic) |
| Local Training | ✅ | ⚠️ Limited* |
| Manual Credentials | Required | Not needed |
| Dataset Storage | Local filesystem | HF Hub |
| Model Storage | Local filesystem | HF Hub |

*Local training in Spaces depends on the Space's CPU/GPU allocation.

## Deployment Checklist

- [ ] Dockerfile is properly configured
- [ ] All dependencies in `requirements.txt`
- [ ] Space is set to Docker SDK
- [ ] Space has proper token permissions
- [ ] Test upload/annotation workflow
- [ ] Test HF Jobs training
- [ ] Verify model download after training

## Troubleshooting

### "401 Unauthorized" Error

**Problem**: Space token doesn't have permissions

**Solution**: 
1. Check Space settings
2. Ensure token has Jobs access
3. Try creating a new Space

### "Dataset not found" Error

**Problem**: Dataset upload failed to HF Hub

**Solution**:
1. Check Space has write permissions
2. Verify network connectivity
3. Check Space logs for upload errors

### Training Doesn't Start

**Problem**: HF Jobs quota exceeded

**Solution**:
1. Check your HF account quota
2. Wait for running jobs to complete
3. Upgrade HF plan if needed

## Best Practices

1. **Use Private Spaces** for your projects
2. **Monitor HF Jobs** dashboard for job status
3. **Clean up old datasets** from HF Hub periodically
4. **Use smaller hardware** (t4-small) for testing
5. **Check Space logs** if issues occur

## Support

- **HF Jobs Documentation**: https://huggingface.co/docs/huggingface_hub/guides/jobs
- **Spaces Documentation**: https://huggingface.co/docs/hub/spaces
- **Issues**: Report on the repository

