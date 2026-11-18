# An original backing track, synthesized here (no samples, nothing licensed).
import numpy as np, wave
sr=44100; bpm=120; beat=60/bpm; dur=28.5; n=int(sr*dur)
L=np.zeros(n+sr*2); rng=np.random.default_rng(7)
def add(sig,t,g=1.0):
    i=int(t*sr); L[i:i+len(sig)]+=sig[:len(L)-i]*g
def env(d,a=0.004,r=None):
    t=np.arange(int(d*sr))/sr; e=np.minimum(t/a,1)*np.exp(-t/(r or d/3)); return t,e
def pluck(f,d=0.32):
    t,e=env(d,r=0.11); return (np.sin(2*np.pi*f*t)+0.35*np.sin(4*np.pi*f*t)+0.15*np.sin(6*np.pi*f*t))*e
def pad(f,d):
    t=np.arange(int(d*sr))/sr; e=np.minimum(t/0.25,1)*np.minimum((d-t)/0.3,1)
    return (np.sin(2*np.pi*f*t)+np.sin(2*np.pi*f*1.004*t)+0.3*np.sin(4*np.pi*f*t))*e
def bass(f,d=0.42):
    t,e=env(d,r=0.2); return np.tanh(2.2*np.sin(2*np.pi*f*t))*e
def kick():
    t=np.arange(int(0.28*sr))/sr; return np.sin(2*np.pi*(48*t+ (110/ -28)*(np.exp(-28*t)-1)))*np.exp(-t/0.09)
def hat(d=0.05):
    t,e=env(d,a=0.001,r=0.013); x=rng.standard_normal(len(t)); return np.diff(x,prepend=0)*e
def clap():
    t,e=env(0.16,a=0.001,r=0.04); x=rng.standard_normal(len(t)); return (x-np.convolve(x,np.ones(12)/12,'same'))*e
midi=lambda m:440*2**((m-69)/12)
# C  G  Am  F, two bars each of 4 beats -> 16 s loop; arps on chord tones
prog=[(48,[60,64,67,72]),(43,[59,62,67,71]),(45,[60,64,69,72]),(41,[60,65,69,72])]
bars=int(dur/(4*beat))+1
for b in range(bars):
    root,ch=prog[(b//1)%4]; t0=b*4*beat
    intro=b<1; out=t0>dur-3.2
    add(pad(midi(ch[0]),4*beat)+pad(midi(ch[1]),4*beat)+pad(midi(ch[2]),4*beat),t0,0.035)
    pat=[0,1,2,3,2,1,2,3] if b%2==0 else [0,2,1,3,2,3,1,2]
    for k in range(8):
        add(pluck(midi(ch[pat[k]]+12)),t0+k*beat/2,0.16 if not intro else 0.11)
    if intro or out: continue
    for q in range(4):
        add(kick(),t0+q*beat,0.55)
        add(hat(),t0+q*beat+beat/2,0.10); add(hat(0.03),t0+q*beat,0.04)
        if q in(1,3): add(clap(),t0+q*beat,0.11)
    for q,off in [(0,0),(1.5,0),(2,12),(3.5,7)]:
        add(bass(midi(root-12+off)),t0+q*beat,0.30)
x=L[:n]; t=np.arange(n)/sr
x*=np.minimum(t/0.4,1)*np.minimum((dur-t)/2.2,1)
x=np.tanh(x*1.5); x/=np.abs(x).max()/0.89
# small stereo width: delayed copy on the right
r=np.concatenate([np.zeros(380),x[:-380]])*0.5+x*0.5
st=np.stack([x,r],1); w=wave.open("music.wav","wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st*32767).astype("<i2").tobytes()); w.close()
