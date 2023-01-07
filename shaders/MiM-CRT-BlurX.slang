#version 450

#include "MiM-CRT-Boilerplate.glsl"

#if defined(PARAMETER_UNIFORM)

#pragma parameter STDDEV_X "Diffusion horizontal blur std. dev" 0.6 0.0 5.0 0.05
#endif

LAYOUT1(push_constant) uniform STRUCT_PREFIX Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
   float STDDEV_X;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform STRUCT_PREFIX UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;
LAYOUT1(location = 1) flat out vec3 vWeightsAndOffset;

const float PI = 3.1415926535;

float Gaussian1D(float x, float std_dev) {
   return exp(-(x*x)/(2.*std_dev*std_dev))/(sqrt(2.*PI)*std_dev);
}

void main()
{
   float w0 = Gaussian1D(0., params.STDDEV_X);
   float w1 = Gaussian1D(1., params.STDDEV_X);
   float w2 = Gaussian1D(2., params.STDDEV_X);
   float sum = w0 + 2.*(w1+w2);
   gl_Position = global.MVP * Position;
   vTexCoord = TexCoord;
   vWeightsAndOffset = vec3(w0/sum, (w1+w2)/sum, (1.*w1 + 2.*w2)/(w1+w2));
}

#pragma stage fragment

LAYOUT1(location = 0) in vec2 vTexCoord;
LAYOUT1(location = 1) flat in vec3 vWeightsAndOffset;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;

vec4 ClampedTexture(sampler2D image, mediump vec2 uv) {
   if (uv != clamp(uv,0.,1.)) return vec4(0);
   return texture(image, uv);
}

vec4 Blur(sampler2D image, mediump vec2 uv, vec2 oo_resolution, vec2 direction) {
  mediump vec2 off1 = vec2(vWeightsAndOffset.z) * direction;
  lowp vec4 color = texture(image, uv) * vWeightsAndOffset.x;
  color += ClampedTexture(image, uv + (off1 * oo_resolution)) + 
           ClampedTexture(image, uv - (off1 * oo_resolution)) * vWeightsAndOffset.y;
  return color;
}

void main()
{
   FragColor = Blur(Source, vTexCoord.xy, params.SourceSize.zw, vec2(1.0,0.));
}
