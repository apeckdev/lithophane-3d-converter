# Lithophane 3D Converter

A modern web application that converts 2D images into 3D printable lithophane STLs. Optimized for creating layered multi-color prints (Hueforge-style) or standard high-quality lithophanes.

## Features

- **Instant 3D Preview**: Visualize your lithophane layer by layer in real-time.
- **Image Cropping**: Crop your uploaded images directly in the app to focus on the subject.
- **Advanced Processing**:
  - **Smoothing**: Apply adjustable blur to reduce noise and jagged edges.
  - **Resolution Control**: Balance print quality (0.1mm) vs file size and speed.
  - **Invert Mode**: Support for both standard lithophanes (Darker = Hight) and inverted.
- **Layer Control**:
  - **Layer Count**: Quantize your image into specific numbers of height layers (great for filament swapping).
  - **Layer Visibility**: Toggle specific layers on/off to create cutouts or transparent styles.
- **Geometry Settings**:
  - **Base Thickness**: Add a solid base layer for structural integrity.
  - **Dimensions**: Set physical print width and min/max heights in mm.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: TailwindCSS
- **3D Engine**: Three.js + React Three Fiber
- **Processing**: Client-side canvas manipulation and geometry generation.

## Getting Started

1.  Clone the repository:
    ```bash
    git clone https://github.com/apeckdev/lithophane-3d-converter.git
    cd lithophane-3d-converter
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

4.  Build for production:
    ```bash
    npm run build
    ```

## Usage

1.  **Upload**: Drag & drop an image or select one from your device.
2.  **Crop**: Adjust the crop frame to select your desired print area.
3.  **Adjust**: Use the settings panel to tune:
    *   **Layer Count**: Number of distinct height levels.
    *   **Min/Max Height**: The physical thickness range of the print.
    *   **Smoothing**: Reduce noise if the image is grainy.
    *   **Resolution**: Lower mm/px gives more detail but larger files.
    *   **Base Thickness**: Add a raft/base for stability.
4.  **Download**: Click "Download STL" to get your file ready for your slicer.

## License

MIT
