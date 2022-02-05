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
#pragma parameter SOURCE_GAMMA "Source Gamma" 2.5 0.5 4.0 0.05

#pragma parameter PHOSPHOR_SCALE "Phosphor Scale" 0.6 0.0 1.5 0.05
#pragma parameter PIXEL_HALF_WIDTH "Phosphor half-width" 0.40 0.0 1.0 0.01
#pragma parameter PIXEL_HALF_HEIGHT "Phosphor half-height" 0.30 0.0 1.0 0.01
#pragma parameter INNER_CURVATURE_X "Phosphor horizontal curvature" 0.15 0.0 1.0  0.01
#pragma parameter INNER_CURVATURE_Y "Phosphor vertical curvature"   0.10 0.0 1.0  0.01
#pragma parameter INNER_CORRECTION_SCALE "Phosphor curvature correction"   1.0 0.0 3.0  0.01

#pragma parameter HALATION_SCALE "Halation Scale" 0.75 0.0 5.0 0.05
#pragma parameter HALATION_FALLOFF "Halation decay power" 7.0 1.0 20.0 0.5
#endif 

LAYOUT1(push_constant) uniform Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
    float SOURCE_GAMMA;
    float HALATION_FALLOFF;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform UBO
{
	mat4 MVP;
} global;

#pragma stage vertex

LAYOUT1(location = 0) in vec4 Position;
LAYOUT1(location = 1) in vec2 TexCoord;
LAYOUT1(location = 0) out vec2 vTexCoord;

void main()
{
   gl_Position = global.MVP * Position;
   vTexCoord = TexCoord;
}

#pragma stage fragment

LAYOUT1(location = 0) in vec2 vTexCoord;
LAYOUT1(location = 0) out vec4 FragColor;
LAYOUT2(set = 0, binding = 2) uniform sampler2D Source;
LAYOUT2(set = 0, binding = 3) uniform sampler2D PassFeedback0;
const vec4 degamma = vec4(vec3(2.2),1.0);
const vec4 regamma = vec4(vec3(1.0/2.2),1.0);

const mediump mat3 RGB_to_YIQ = mat3( 0.299 , 0.595716 , 0.211456 ,	0.587    , -0.274453 , -0.522591 ,		0.114    , -0.321263 , 0.311135 );
const mediump mat3 YIQ_to_RGB = mat3( 1.0   , 1.0      , 1.0      ,	0.9563   , -0.2721   , -1.1070   ,		0.6210   , -0.6474   , 1.7046   );

void main()
{
    vec4 src_degamma = vec4(vec3(params.SOURCE_GAMMA),1.0);
    lowp vec4 curr = pow(texture(Source, vTexCoord), src_degamma);
    lowp vec4 prev = pow(texture(PassFeedback0, vTexCoord), degamma);
    lowp float accumulated_halation = prev.a;
    lowp float prev_halation = (prev.rgb * RGB_to_YIQ).r;
    lowp float halation = max(prev_halation, accumulated_halation / params.HALATION_FALLOFF);

    FragColor = pow(vec4(curr.rgb, halation), regamma);
}
