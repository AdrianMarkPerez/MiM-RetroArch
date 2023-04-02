#version 450

#include "MiM-CRT-Boilerplate.glsl"

#if defined(PARAMETER_UNIFORM)
#pragma parameter PHOSPHOR_SCALE "Phosphor Scale" 1.1 0.0 25.0 0.05
#pragma parameter INNER_CURVATURE_X "Phosphor horizontal curvature" 0.15 0.0 1.0  0.01
#pragma parameter INNER_CURVATURE_Y "Phosphor vertical curvature"   0.10 0.0 1.0  0.01
#pragma parameter INNER_CORRECTION_SCALE "Phosphor curvature correction"   9.0 0.0 10.0  0.01
#pragma parameter PHOSPHOR_MIDPOINT_T "Phosphor midpoint t"   0.0 0.0 1.0  0.01

#pragma parameter HALATION_SCALE "Halation Scale" 0.75 0.0 5.0 0.05
#pragma parameter HALATION_COLOR_FALLOFF "Halation color decay power" 7.0 1.05 20.0 0.05
#pragma parameter HALATION_BRIGHTNESS_FALLOFF "Halation brightness decay power" 7.0 1.05 20.0 0.05

#pragma parameter DIFFUSION_SCALE "Diffusion Scale" 0.65 0.0 5.0 0.05
#pragma parameter OUTER_CURVATURE_X "Diffusion horizontal curvature" 0.15 0.0 1.0  0.01
#pragma parameter OUTER_CURVATURE_Y "Diffusion vertical curvature"   0.10 0.0 1.0  0.01
#pragma parameter OUTER_CORRECTION_SCALE "Diffusion curvature correction"   9.11 0.0 10.0  0.01

#pragma parameter EXPOSURE "Exposure" 1.0 0.1 10.0 0.1

#pragma parameter CORNER_RADIUS "Corner Radius" 0.035 0.005 0.1 0.005

#pragma parameter DEBUG_ZOOM "Debug Zoom" 1.0 0.01 1.0 0.01
#pragma parameter DEBUG_PAN_X "Debug Pan (X)" 0.0 0.0 1.0 0.01
#pragma parameter DEBUG_PAN_Y "Debug Pan (Y)" 0.0 0.0 1.0 0.01
#endif

LAYOUT1(push_constant) uniform STRUCT_PREFIX Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
	float warpX;
	float warpY;
	float INNER_CURVATURE_X;
	float INNER_CURVATURE_Y;
	float INNER_CORRECTION_SCALE;
	float OUTER_CURVATURE_X;
	float OUTER_CURVATURE_Y;
	float OUTER_CORRECTION_SCALE;	
	float PHOSPHOR_SCALE;
	float PHOSPHOR_MIDPOINT_T;
	float HALATION_SCALE;
	float HALATION_COLOR_FALLOFF;
	float HALATION_BRIGHTNESS_FALLOFF;
	float DIFFUSION_SCALE;
	float EXPOSURE;
	float CORNER_RADIUS;
	float DEBUG_ZOOM;
	float DEBUG_PAN_X;
	float DEBUG_PAN_Y;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform STRUCT_PREFIX UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;
LAYOUT1(location = 1) flat out vec4 vPhosphorCurvature;
LAYOUT1(location = 2) flat out vec4 vDiffusionCurvature;

void main() {
    gl_Position = global.MVP * Position;
    float panel_size = params.DEBUG_ZOOM;
    vTexCoord.xy = TexCoord.xy * vec2(panel_size, panel_size) + 
   	 			   vec2((1.0 - panel_size)*params.DEBUG_PAN_X, 
					    (1.0 - panel_size)*params.DEBUG_PAN_Y);

	const float kCorrectionBias = -8.;
	vPhosphorCurvature = vec4(
		vec2(params.INNER_CURVATURE_X, params.INNER_CURVATURE_Y),
		1.0 / (1. + 0.125 * (params.INNER_CORRECTION_SCALE + kCorrectionBias) * vec2(max(params.INNER_CURVATURE_X, params.INNER_CURVATURE_Y))));
	vDiffusionCurvature = vec4(
		vec2(params.OUTER_CURVATURE_X, params.OUTER_CURVATURE_Y),
		1.0 / (1. + 0.125 * (params.OUTER_CORRECTION_SCALE + kCorrectionBias) * vec2(max(params.OUTER_CURVATURE_X, params.OUTER_CURVATURE_Y))));
}

#pragma stage fragment

precision mediump int;
precision mediump float;

LAYOUT1(location = 0) in vec2 vTexCoord;
LAYOUT1(location = 1) flat in vec4 vPhosphorCurvature;
LAYOUT1(location = 2) flat in vec4 vDiffusionCurvature;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;
LAYOUT2(set = 0, binding = 3) uniform sampler2D FirstPass;

#include "MiM-CRT-DecodePrepped.glsl"
#include "MiM-CRT-Utils.glsl"

void main() {
    FragColor = CrtColor(FirstPass, Source);
}
