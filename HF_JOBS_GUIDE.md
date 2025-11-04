# Hugging Face Jobs Integration Guide

FreeFlow now supports training your YOLO models on Hugging Face's cloud infrastructure using **Hugging Face Jobs**! This allows you to train models on powerful GPUs and TPUs without needing local hardware.

## What are Hugging Face Jobs?

Hugging Face Jobs provide on-demand compute for AI workloads. You can run training jobs on various hardware configurations, from basic CPUs to high-end GPUs and TPUs, and you only pay for what you use.

## Features

- ✅ Train on powerful cloud GPUs (T4, A10G, A100, L4)
- ✅ Optional TPU support (v5e)
- ✅ Real-time monitoring of training progress
- ✅ Automatic dataset upload and management
- ✅ Secure credential storage in browser
- ✅ Pay-as-you-go pricing

## Prerequisites

1. **Hugging Face Account**: Sign up at [huggingface.co](https://huggingface.co)
2. **Pro Subscription**: HF Jobs require a Pro subscription ($9/month)
3. **API Token**: Get your token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
   - Create a token with **write** permissions

## How to Use

### Step 1: Navigate to Training

1. Open your project in FreeFlow
2. Click on the **Training** tab

### Step 2: Select Hugging Face Jobs

1. In the **Training Location** dropdown, select **Hugging Face Jobs**
2. Enter your credentials:
   - **Username**: Your Hugging Face username
   - **API Key**: Your HF API token (starts with `hf_...`)
   
   *These credentials will be cached in your browser for convenience*

### Step 3: Choose Hardware

Select from available hardware options:

**GPU Options (Recommended for YOLO training):**
- `t4-small` - NVIDIA T4 (Default, good balance of cost and performance)
- `t4-medium` - NVIDIA T4 with more resources
- `l4x1` - NVIDIA L4
- `a10g-small` - NVIDIA A10G
- `a10g-large` - NVIDIA A10G with more resources
- `a100-large` - NVIDIA A100 (most powerful)

**CPU Options:**
- `cpu-basic` - Basic CPU
- `cpu-upgrade` - Enhanced CPU

**TPU Options (Experimental):**
- `v5e-1x1` - TPU v5e
- `v5e-2x2` - TPU v5e 2x2
- `v5e-2x4` - TPU v5e 2x4

### Step 4: Configure Training

Set your training parameters as usual:
- Model Name
- Model Size (Nano, Small, Medium, Large, X-Large)
- Dataset Version (or auto-split)
- Epochs
- Batch Size
- Image Size

### Step 5: Start Training

Click **Start Training** to:
1. Prepare your dataset
2. Upload it to Hugging Face Hub (private dataset repo)
3. Launch the training job on HF infrastructure
4. Monitor progress in real-time

## Monitoring Training

Once training starts, you'll see:
- Job status updates
- Link to HF Jobs dashboard
- Real-time progress (when available)
- Training completion notifications

## Pricing

Hugging Face Jobs use pay-as-you-go pricing:
- **T4 Small**: ~$0.60/hour
- **A10G Large**: ~$1.20/hour
- **A100 Large**: ~$4.00/hour

Prices are approximate. Check [Hugging Face Pricing](https://huggingface.co/pricing) for current rates.

## Tips for Success

1. **Start Small**: Test with `t4-small` first before scaling up
2. **Monitor Costs**: Keep an eye on training duration
3. **Use Versioned Datasets**: For reproducibility
4. **Set Appropriate Timeouts**: Default is 2 hours; adjust if needed
5. **Check Logs**: Use the HF Jobs dashboard link to see detailed logs

## Troubleshooting

### "Credentials required" error
- Make sure you've entered your HF username and API key
- Verify your API token has write permissions

### Job fails immediately
- Check your HF account has Pro subscription
- Verify your dataset has annotated images
- Try a different hardware flavor

### Can't see training progress
- HF Jobs run asynchronously; check the HF dashboard link
- Logs may take a few minutes to appear

### Job times out
- Default timeout is 2 hours
- For longer training, increase epochs gradually or use multiple jobs

## Security

- API keys are stored in browser localStorage only
- Credentials are never saved to server
- Dataset repos are created as private by default
- You can delete dataset repos after training completes

## Comparison: Local vs HF Jobs

| Feature | Local Training | HF Jobs |
|---------|---------------|---------|
| Hardware Cost | One-time investment | Pay-per-use |
| Setup | Requires local GPU | No setup needed |
| Scalability | Limited by hardware | Scale on demand |
| Accessibility | Computer must stay on | Cloud-based |
| Monitoring | Real-time via socket | Dashboard + status |

## Additional Resources

- [HF Jobs Documentation](https://huggingface.co/docs/huggingface_hub/en/guides/jobs)
- [Supported Hardware](https://huggingface.co/pricing)
- [API Tokens Guide](https://huggingface.co/docs/hub/security-tokens)

## Support

For issues with:
- **FreeFlow Integration**: Open an issue on the FreeFlow repository
- **HF Jobs Platform**: Contact Hugging Face support

---

Happy Training! 🚀

