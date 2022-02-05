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
#pragma parameter STDDEV_X "Diffusion horizontal blur std. dev" 0.6 0.0 5.0 0.05
#pragma parameter STDDEV_Y "Diffusion vertical blur std. dev" 0.6 0.0 5.0 0.05
#pragma parameter STROBE_STRENGTH_Y "Diffusion horizontal strobe strength" 0.5 0.0 4.0 0.05
#pragma parameter STROBE_STRENGTH_X "Diffusion vertical strobe strength" 0.5 0.0 4.0 0.05
#endif 

LAYOUT1(push_constant) uniform Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
   float PIXEL_HALF_HEIGHT;
   float STROBE_STRENGTH_Y;
   float STDDEV_Y;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;
LAYOUT1(location = 1) out flat vec3 vWeightsAndOffset;

const float PI = 3.1415926535;

float Gaussian1D(float x, float std_dev) {
   return exp(-(x*x)/(2.*std_dev*std_dev))/(sqrt(2.*PI)*std_dev);
}

void main()
{
   float w0 = Gaussian1D(0., params.STDDEV_Y);
   float w1 = Gaussian1D(1., params.STDDEV_Y);
   float w2 = Gaussian1D(2., params.STDDEV_Y);
   float sum = w0 + 2.*(w1+w2);
   gl_Position = global.MVP * Position;
   vTexCoord = TexCoord;
   vWeightsAndOffset = vec3(w0/sum, (w1+w2)/sum, (1.*w1 + 2.*w2)/(w1+w2));
}

#pragma stage fragment

precision mediump int;
precision mediump float;

LAYOUT1(location = 0) in vec2 vTexCoord;
LAYOUT1(location = 1) in flat vec3 vWeightsAndOffset;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;

vec4 ClampedTexture(sampler2D image, mediump vec2 uv) {
   if (uv != clamp(uv,0.,1.)) return vec4(0);
   return texture(image, uv);
}

const mediump vec4 degamma = vec4(vec3(2.2), 1.0);
const mediump vec4 regamma = vec4(vec3(1.0/2.2), 1.0);

vec4 Blur(sampler2D image, mediump vec2 uv, vec2 oo_resolution, vec2 direction) {
  mediump vec2 off1 = vec2(vWeightsAndOffset.z) * direction;
  lowp vec4 color = pow(texture(image, uv), degamma) * vWeightsAndOffset.x;
  color += (pow(ClampedTexture(image, uv + (off1 * oo_resolution)), degamma) + 
            pow(ClampedTexture(image, uv - (off1 * oo_resolution)), degamma)) * vWeightsAndOffset.y;
  return pow(color, regamma);
}

void main()
{
   FragColor = Blur(Source, vTexCoord, params.SourceSize.zw, vec2(0.,1.0));
}
