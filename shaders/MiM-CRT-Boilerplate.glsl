
/** Smooths seams for compatibility between glsl 450 (retroarch) and 300 es (webgl 2). */
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