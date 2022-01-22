# MiM-RetroArch

RetroArch shaders designed for pi4+

## `MiM-CRT` Shader

Runs at 60hz on a pi4 at 720p. [Demo[(https://adrianmarkperez.github.io/MiM-RetroArch/demo/crt-demo.html).

The goal was to create something that maintained framerate and approached the quality of shaders targeting desktop GPUs like e.g. `crt-royale` (twelve passes) or `crt-guest-dr-venom` (ten passes).

`MiM-CRT` uses four passes:

### Pass 0: Prep

Corrects for the input gamma and stores luminance history in the alpha channel.  

The alpha term is used in the last pass to approximate halation (caused by phosphors remaining lit for a time after being hit by the beam).  The Halation Power defines how quickly old luminance fades away.  Old sets from the 80's had a _lot_ of halation.

### Pass 1+2: Blur and strobe

A configurable 9x9 gaussian blur is performed with two passes (performing 5 texture samples each).  Pass 1 (horizontal blur) renders into a target twice as wide as the source, centers the source texels on the 'odd' destination texels, and has a configurable darkening strobe applied to the even pixels.  Pass 2 (vertical blur) does the same into a target twice as high.

The result of this blur pass is used to approximate diffusion (caused by light bouncing around as it travels between the lit phosphor and the CRT surface).  The strobe term allows for very "tight" (i.e. slightly smaller than source pixel) glows, and can be turned down (and the standard deviations turned up) to approximate e.g. dive-bar sets from the early 80's.

### Pass 3: Resolve

_todo_

## Appendix A: Overclocking the pi4 GPU

Gentle overclocking for the GPU helps keep visual stuttering (when the GPU isn't able to finish its frames in time).  This can be accomplished by modifying `/boot/config.txt`:

```
# Turn up GPU (+ core freq, for the memory used by the GPU) to 750 Mhz
arm_boost=1
v3d_freq=750
core_freq=750
```
