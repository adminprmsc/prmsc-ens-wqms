# Images Folder

This folder contains all images used in the Water Quality Management System.

## Required Images

### 1. **logo-left.png**
- **Purpose**: PCRWR (Pakistan Council of Research in Water Resources) Logo
- **Location**: Left side of the form header
- **Recommended Size**: 120x120 pixels
- **Format**: PNG with transparent background
- **Description**: Official PCRWR logo with seal/emblem

### 2. **logo-right.png**
- **Purpose**: PNAC (Pakistan National Accreditation Council) Logo
- **Location**: Right side of the form header
- **Recommended Size**: 120x120 pixels
- **Format**: PNG with transparent background
- **Description**: Official PNAC logo/certification mark

## How to Add Images

### Step 1: Prepare Your Images
1. Get the PCRWR logo (left logo)
2. Get the PNAC logo (right logo)
3. Resize both to approximately 120x120 pixels
4. Save as PNG format with transparent background

### Step 2: Place Images in Folder
1. Save `logo-left.png` in this `images/` folder
2. Save `logo-right.png` in this `images/` folder

### Step 3: Verify in Application
1. Start the Flask server: `python app.py`
2. Navigate to: http://localhost:5000/add-water-test
3. Check if logos appear in the form header

## Image Specifications

| Property | Value |
|----------|-------|
| Width | 120 pixels |
| Height | 120 pixels |
| Format | PNG |
| Background | Transparent |
| Quality | High (300 DPI recommended) |

## Placeholder Behavior

If the image files are not found:
- A gray placeholder box will appear
- The placeholder shows "Logo" text
- This allows the form to work without images

## File Structure

```
images/
├── README.md (this file)
├── logo-left.png (PCRWR logo)
└── logo-right.png (PNAC logo)
```

## Notes

- Keep image file names exactly as specified (lowercase, with hyphens)
- Use PNG format for best quality and transparency support
- Ensure logos are centered and properly sized
- Test on different screen sizes to verify appearance

## Support

For issues with image display:
1. Check file names match exactly: `logo-left.png` and `logo-right.png`
2. Verify files are in the `images/` folder
3. Check browser console (F12) for any error messages
4. Ensure images are valid PNG files

---

**Last Updated**: 2025-10-25
**Status**: Ready for images

