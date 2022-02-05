#version 450

#if defined(GL_ES) && (__VERSION__==300)
#define LAYOUT1(a)
#define LAYOUT2(a,b)
#define LAYOUT3(a,b,c)

precision mediump int;
precision mediump float;
#else
#define LAYOUT1(a) layout(a)
#define LAYOUT2(a,b) layout(a,b)
#define LAYOUT3(a,b,c) layout(a,b,c)
#endif

#if defined(PARAMETER_UNIFORM)
#pragma parameter PIXEL_HALF_WIDTH "Phosphor half-width" 0.40 0.0 1.0 0.01
#pragma parameter PIXEL_HALF_HEIGHT "Phosphor half-height" 0.30 0.0 1.0 0.01

#pragma parameter DIFFUSION_SCALE "Diffusion Scale" 0.45 0.0 5.0 0.05
#pragma parameter OUTER_CURVATURE_X "Diffusion horizontal curvature" 0.15 0.0 1.0  0.01
#pragma parameter OUTER_CURVATURE_Y "Diffusion vertical curvature"   0.10 0.0 1.0  0.01
#pragma parameter STDDEV "Diffusion blur std. dev" 0.6 0.0 5.0 0.05
#endif

LAYOUT1(push_constant) uniform Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
   float STDDEV;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;
LAYOUT1(location = 1) out flat vec3 vWeights;

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
LAYOUT1(location = 1) in flat vec3 vWeights;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;

vec4 ClampedTexture(sampler2D image, mediump vec2 uv) {
   if (uv != clamp(uv,0.,1.)) return vec4(0);
   return texture(image, uv);
}

const mediump vec4 degamma = vec4(vec3(2.2), 1.0);
const mediump vec4 regamma = vec4(vec3(1.0/2.2), 1.0);

void main()
{
   ivec2 uv = ivec2(floor(vTexCoord * params.SourceSize.xy));
   lowp vec4 s00 = pow(texelFetch(Source, uv, 0), degamma);
   lowp vec4 s0p = pow(texelFetchOffset(Source, uv, 0, ivec2(0,+1)), degamma);
   lowp vec4 s0n = pow(texelFetchOffset(Source, uv, 0, ivec2(0,-1)), degamma);
   lowp vec4 sp0 = pow(texelFetchOffset(Source, uv, 0, ivec2(+1,0)), degamma);
   lowp vec4 sn0 = pow(texelFetchOffset(Source, uv, 0, ivec2(-1,0)), degamma);
   lowp vec4 spp = pow(texelFetchOffset(Source, uv, 0, ivec2(+1,+1)), degamma);
   lowp vec4 spn = pow(texelFetchOffset(Source, uv, 0, ivec2(+1,-1)), degamma);
   lowp vec4 snp = pow(texelFetchOffset(Source, uv, 0, ivec2(-1,+1)), degamma);
   lowp vec4 snn = pow(texelFetchOffset(Source, uv, 0, ivec2(-1,-1)), degamma);

   vec4 result = s00 * vWeights.x +
   (s0p + s0n) * vWeights.y + 
   (sp0 + sn0) * vWeights.y +
   (spp + spn) * vWeights.z +
   (snp + snn) * vWeights.z;

   FragColor = pow(result, regamma);
}
