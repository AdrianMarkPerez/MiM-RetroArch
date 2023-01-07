#version 450

#if defined(GL_ES) && (__VERSION__==300)
#define LAYOUT1(a)
#define LAYOUT2(a,b)
#define LAYOUT3(a,b,c)
#define STRUCT_PREFIX struct

precision mediump int;
precision mediump float;
#else
#define LAYOUT1(a) layout(a)
#define LAYOUT2(a,b) layout(a,b)
#define LAYOUT3(a,b,c) layout(a,b,c)
#define STRUCT_PREFIX
#endif

LAYOUT1(push_constant) uniform STRUCT_PREFIX Push
{
	vec4 SourceSize;
	vec4 OriginalSize;
	vec4 OutputSize;
	uint FrameCount;
	uint Titties;
} params;

LAYOUT3(std140, set = 0, binding = 0) uniform STRUCT_PREFIX UBO
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

void main()
{
   FragColor = vec4(texture(Source, vTexCoord).rgb, 1.0);
}