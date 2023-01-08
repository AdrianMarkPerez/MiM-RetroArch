# MiM-RetroArch

RetroArch shaders designed for pi4+

## `MiM-CRT` Shader

Runs at 60hz on a pi4 at 720p.

The goal was to create something that maintained framerate and approached the quality of shaders targeting desktop GPUs like e.g. `crt-royale` (twelve passes) or `crt-guest-dr-venom` (ten passes).

### Examples

| Example Subregion | Notes |
| --- | --- |
| <img src="images/Example-HD.png" data-canonical-src="images/Example-HD.png" width="244" height="324" /> | At HD resolution (720p), there is barely enough resolution to distinguish scanlines.  |
| <img src="images/Example-FHD.png" data-canonical-src="images/Example-FHD.png" width="244" height="324" /> | At FHD resolution (1080p), scanlines are clear, phosphor height differences are indistinguishable. |
| <img src="images/Example-QHD.png" data-canonical-src="images/Example-QHD.png" width="244" height="324" /> | At QHD resolution (1440p), phosphor height differences are fairly distinct. |
| <img src="images/Example-UHD.png" data-canonical-src="images/Example-UHD.png" width="244" height="324" /> | At UHD resolution (2160p), subpixels are distinct. |
| <img src="images/Example-8k.png" data-canonical-src="images/Example-8k.png" width="244" height="324" /> | At 8k resolution (4320p), individual phosphors within a subpixel are discrenable. |

### Description

`MiM-CRT` uses up to four passes:

#### Prep Pass

Corrects for the input gamma and stores luminance history in the alpha channel.  

The alpha term is used in the last pass to approximate halation (caused by phosphors remaining lit for a time after being hit by the beam).  The Halation Power defines how quickly old luminance fades away.  Old sets from the 80's had a _lot_ of halation.

#### Blur Pass

A configurable gaussian blur is performed with two passes (9x9, performing 5 texture samples each) or one pass (3x3, performing 9 samples).  

The result of these blur passes is used to approximate diffusion (caused by light bouncing around as it travels between the lit phosphor and the CRT surface).

`MiM-CRT-2pass` skips blur entirely. 

#### Resolve Pass

The Phorphor term is computed by summed area, to minimize aliasing. The parallelogram of each pixel is approximated with an MxN grid of axis aligned rectangles.  The RPi can only handle about a 2x2 subgrid before it starts dropping frames.  It samples the result of pass 0 four times.

The Diffusion term is a saampling of the blurred texture.  A throw term biases intermediate points towards or away from the center of the "odd" pixels.

There are separate curve and correction parameters for Phosphor and Diffusion, to support a range of glass thickness,

## Appendix A: Overclocking the pi4 GPU

Gentle overclocking for the GPU helps keep visual stuttering (when the GPU isn't able to finish its frames in time).  This can be accomplished by modifying `/boot/config.txt`:

```
# Turn up GPU (+ core freq, for the memory used by the GPU) to 750 Mhz
arm_boost=1
v3d_freq=750
core_freq=750
```
