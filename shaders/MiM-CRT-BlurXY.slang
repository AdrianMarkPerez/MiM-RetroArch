#version 450

#include "MiM-CRT-Boilerplate.glsl"

#if defined(PARAMETER_UNIFORM)

#pragma parameter STDDEV "Diffusion blur std. dev" 0.6 0.0 5.0 0.05
#endif

LAYOUT1(push_constant) uniform STRUCT_PREFIX Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
   float STDDEV;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform STRUCT_PREFIX UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;
LAYOUT1(location = 1) flat out vec3 vWeights;

const float PI = 3.1415926535;

float Gaussian2D(float x, float y, float std_dev) {
   return exp(-(x*x + y*y)/(2.*std_dev*std_dev))/(2.*PI*std_dev*std_dev);
}

void main()
{
   float w0 = Gaussian2D(0.,0., params.STDDEV);
   float w1 = Gaussian2D(1.,0., params.STDDEV);
   float w2 = Gaussian2D(1.,1., params.STDDEV);
   float sum = w0 + 4.*(w1+w2);
   gl_Position = global.MVP * Position;
   vTexCoord = TexCoord;
   vWeights = vec3(w0/sum, w1/sum, w2/sum);
}

#pragma stage fragment

LAYOUT1(location = 0) in vec2 vTexCoord;
LAYOUT1(location = 1) flat in vec3 vWeights;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;

vec4 ClampedTexture(sampler2D image, mediump vec2 uv) {
   if (uv != clamp(uv,0.,1.)) return vec4(0);
   return texture(image, uv);
}

void main()
{
   ivec2 uv = ivec2(floor(vTexCoord * params.SourceSize.xy));
   lowp vec4 s00 = texelFetch(Source, uv, 0);
   lowp vec4 s0p = texelFetchOffset(Source, uv, 0, ivec2(+0,+1));
   lowp vec4 s0n = texelFetchOffset(Source, uv, 0, ivec2(+0,-1));
   lowp vec4 sp0 = texelFetchOffset(Source, uv, 0, ivec2(+1,+0));
   lowp vec4 sn0 = texelFetchOffset(Source, uv, 0, ivec2(-1,+0));
   lowp vec4 spp = texelFetchOffset(Source, uv, 0, ivec2(+1,+1));
   lowp vec4 spn = texelFetchOffset(Source, uv, 0, ivec2(+1,-1));
   lowp vec4 snp = texelFetchOffset(Source, uv, 0, ivec2(-1,+1));
   lowp vec4 snn = texelFetchOffset(Source, uv, 0, ivec2(-1,-1));

   FragColor = s00 * vWeights.x +
               (s0p + s0n) * vWeights.y + 
               (sp0 + sn0) * vWeights.y +
               (spp + spn) * vWeights.z +
               (snp + snn) * vWeights.z;
}
