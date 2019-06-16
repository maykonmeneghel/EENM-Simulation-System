%% Cleaner
clc;
clear;
close all;

%% Construct object current
Parameters = currentEENM(1000, 0.01, 40, 20, 100, 'Mono','S', 'step', 'Amplitude', []);
Parameters = createUMs('Soleus','Cilindric', 'Cilindric', 80, Parameters, 6.3);
Parameters = demangeMNs(Parameters);

y0 = setInit();
job(1)  = batch(@runnn,3,{Parameters.data.Motoneurons.S.Quantity ,Parameters.data.Motoneurons.S.Area ,Parameters, 1,Parameters.time,y0});
job(2)  = batch(@runnn,3,{Parameters.data.Motoneurons.FR.Quantity ,Parameters.data.Motoneurons.FR.Area ,Parameters, 1,Parameters.time,y0});
job(3)  = batch(@runnn,3,{Parameters.data.Motoneurons.FF.Quantity ,Parameters.data.Motoneurons.FF.Area ,Parameters, 1,Parameters.time,y0});

wait(job(1));
wait(job(2));
wait(job(3));

Data_S      = fetchOutputs(job(1));
Vs_S        = medfilt2(cell2mat(Data_S(:,1)));
Vd_S        = medfilt2(cell2mat(Data_S(:,2)));
Data_FR      = fetchOutputs(job(2));
Vs_FR        = medfilt2(cell2mat(Data_FR(:,1)));
Vd_FR        = medfilt2(cell2mat(Data_FR(:,2)));
Data_FF      = fetchOutputs(job(3));
Vs_FF        = medfilt2(cell2mat(Data_FF(:,1)));
Vd_FF        = medfilt2(cell2mat(Data_FF(:,2)));

lamb = sqrt(1.0/0.070);  
%x = (0:(app.Slider2.Value/100)/(length(Parameters.time)-1):(app.Slider2.Value/100))';
compAxonioMotor = 80;
x=(compAxonioMotor/100);
VJN_S = zeros(length(Parameters.time),Parameters.data.Motoneurons.S.Quantity);
for k=1:Parameters.data.Motoneurons.S.Quantity
    VJN_S(:,k)=((Vs_S(:,k).*0.070.*lamb)./2).*exp(-abs(x)./lamb); %doi: 10.1016/j.bpj.2012.01.055                         
end
VJN_FR = zeros(length(Parameters.time),Parameters.data.Motoneurons.FR.Quantity);
for k=1:Parameters.data.Motoneurons.FR.Quantity
    VJN_FR(:,k)=((Vs_FR(:,k).*0.070.*lamb)./2).*exp(-abs(x)./lamb); %doi: 10.1016/j.bpj.2012.01.055                         
end
VJN_FF = zeros(length(Parameters.time),Parameters.data.Motoneurons.FF.Quantity);
for k=1:Parameters.data.Motoneurons.FF.Quantity
    VJN_FF(:,k)=((Vs_FF(:,k).*0.070.*lamb)./2).*exp(-abs(x)./lamb); %doi: 10.1016/j.bpj.2012.01.055                         
end

t2=-1.25:0.01:1.25;

UMAP_S = zeros(length(Parameters.time),Parameters.data.Motoneurons.S.Quantity);
for k=1:Parameters.data.Motoneurons.S.Quantity
    AP1 = (t2.*exp(-(t2./Parameters.data.MuscleFibers.Type.S.APTF.Value(k)).^2));
    AP2 = ((1-2.*(t2./Parameters.data.MuscleFibers.Type.S.APTF.Value(k)).^2).*exp(-((t2./Parameters.data.MuscleFibers.Type.S.APTF.Value(k)).^2)));
    p=randi([0,1]);
    [ValPeak_S, pikes_S] = findpeaks(VJN_S(:,k),'MinPeakHeight',0);
    for i=1:size(pikes_S,1)
        switch(p)
            case 0
                UMAP_S(pikes_S(i)+Parameters.data.MuscleFibers.Type.S.APAT.Value(k):pikes_S(i)+Parameters.data.MuscleFibers.Type.S.APAT.Value(k)+size(AP1,2)-1,k) = (ValPeak_S(i).*Parameters.data.MuscleFibers.Type.S.APSF.Value(k).*AP1(1,1:251));
            case 1
                UMAP_S(pikes_S(i)+Parameters.data.MuscleFibers.Type.S.APAT.Value(k):pikes_S(i)+Parameters.data.MuscleFibers.Type.S.APAT.Value(k)+size(AP1,2)-1,k) = (ValPeak_S(i).*Parameters.data.MuscleFibers.Type.S.APSF.Value(k).*AP2(1,1:251));
        end
    end
end
UMAP_S = UMAP_S(1:length(Parameters.time),:);

UMAP_FR = zeros(length(Parameters.time),Parameters.data.Motoneurons.FR.Quantity);
for k=1:Parameters.data.Motoneurons.FR.Quantity
    AP1 = (t2.*exp(-(t2./Parameters.data.MuscleFibers.Type.FR.APTF.Value(k)).^2));
    AP2 = ((1-2.*(t2./Parameters.data.MuscleFibers.Type.FR.APTF.Value(k)).^2).*exp(-((t2./Parameters.data.MuscleFibers.Type.FR.APTF.Value(k)).^2)));
    p=randi([0,1]);
    [ValPeak_FR, pikes_FR] = findpeaks(VJN_FR(:,k),'MinPeakHeight',0);
    for i=1:size(pikes_FR,1)
        switch(p)
            case 0
                UMAP_FR(pikes_FR(i)+Parameters.data.MuscleFibers.Type.FR.APAT.Value(k):pikes_FR(i)+Parameters.data.MuscleFibers.Type.FR.APAT.Value(k)+size(AP1,2)-1,k) = (ValPeak_FR(i).*Parameters.data.MuscleFibers.Type.FR.APSF.Value(k).*AP1(1,1:251));
            case 1
                UMAP_FR(pikes_FR(i)+Parameters.data.MuscleFibers.Type.FR.APAT.Value(k):pikes_FR(i)+Parameters.data.MuscleFibers.Type.FR.APAT.Value(k)+size(AP1,2)-1,k) = (ValPeak_FR(i).*Parameters.data.MuscleFibers.Type.FR.APSF.Value(k).*AP2(1,1:251));
        end
    end
end
UMAP_FR = UMAP_FR(1:length(Parameters.time),:);

UMAP_FF = zeros(length(Parameters.time),Parameters.data.Motoneurons.FF.Quantity);
for k=1:Parameters.data.Motoneurons.FF.Quantity
    AP1 = (t2.*exp(-(t2./Parameters.data.MuscleFibers.Type.FF.APTF.Value(k)).^2));
    AP2 = ((1-2.*(t2./Parameters.data.MuscleFibers.Type.FF.APTF.Value(k)).^2).*exp(-((t2./Parameters.data.MuscleFibers.Type.FF.APTF.Value(k)).^2)));
    p=randi([0,1]);
    [ValPeak_FF, pikes_FF] = findpeaks(VJN_FF(:,k),'MinPeakHeight',0);
    for i=1:size(pikes_FF,1)
        switch(p)
            case 0
                UMAP_FF(pikes_FF(i)+Parameters.data.MuscleFibers.Type.FF.APAT.Value(k):pikes_FF(i)+Parameters.data.MuscleFibers.Type.FF.APAT.Value(k)+size(AP1,2)-1,k) = (ValPeak_FF(i).*Parameters.data.MuscleFibers.Type.FF.APSF.Value(k).*AP1(1,1:251));
            case 1
                UMAP_FF(pikes_FF(i)+Parameters.data.MuscleFibers.Type.FF.APAT.Value(k):pikes_FF(i)+Parameters.data.MuscleFibers.Type.FF.APAT.Value(k)+size(AP1,2)-1,k) = (ValPeak_FF(i).*Parameters.data.MuscleFibers.Type.FF.APSF.Value(k).*AP2(1,1:251));
        end
    end
end
UMAP_FF = UMAP_FF(1:length(Parameters.time),:);

e_S=zeros(length(Parameters.time),1);
e_FR=zeros(length(Parameters.time),1);
e_FF=zeros(length(Parameters.time),1);
for i=1:length(Parameters.time)
    e_S(i,1) = sum(UMAP_S(i,:));
    e_FR(i,1) = sum(UMAP_FR(i,:));
    e_FF(i,1) = sum(UMAP_FF(i,:));
end

spikeS = detectSpike(e_S);
spikeFR = detectSpike(e_FR);
spikeFF = detectSpike(e_FF);

f_FF = zeros(Parameters.data.Motoneurons.FF.Quantity,length(Parameters.time));
for k=1:Parameters.data.Motoneurons.FF.Quantity
    for n=3:length(Parameters.time)
        f_FF(k,n)=(2*exp(-Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.FF.MTTP.Value(1,k))*f_FF(k,n-1)-exp(-2*Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.FF.MTTP.Value(1,k))*f_FF(k,n-2)+(Parameters.data.MuscleFibers.Type.FF.MT.Value(1,k)*(Parameters.data.EENM.step^2)/Parameters.data.MuscleFibers.Type.FF.MTTP.Value(1,k))*exp(1-(Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.FF.MTTP.Value(1,k)))*spikeFF(n-1));
    end
end  
f_FR = zeros(Parameters.data.Motoneurons.FR.Quantity,length(Parameters.time)); 
for k=1:Parameters.data.Motoneurons.FR.Quantity
    for n=3:length(Parameters.time)
       f_FR(k,n)=(2*exp(-Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.FR.MTTP.Value(1,k))*f_FR(k,n-1)-exp(-2*Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.FR.MTTP.Value(1,k))*f_FR(k,n-2)+(Parameters.data.MuscleFibers.Type.FR.MT.Value(1,k)*(Parameters.data.EENM.step^2)/Parameters.data.MuscleFibers.Type.FR.MTTP.Value(1,k))*exp(1-(Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.FR.MTTP.Value(1,k)))*spikeFR(n-1));
    end
end
f_S = zeros(Parameters.data.Motoneurons.S.Quantity,length(Parameters.time));
for k=1:Parameters.data.Motoneurons.S.Quantity
    for n=3:length(Parameters.time)
      f_S(k,n)=(2*exp(-Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.S.MTTP.Value(1,k))*f_S(k,n-1)-exp(-2*Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.S.MTTP.Value(1,k))*f_S(k,n-2)+(Parameters.data.MuscleFibers.Type.S.MT.Value(1,k)*(Parameters.data.EENM.step^2)/Parameters.data.MuscleFibers.Type.S.MTTP.Value(1,k))*exp(1-(Parameters.data.EENM.step/Parameters.data.MuscleFibers.Type.S.MTTP.Value(1,k)))*spikeS(n-1));
    end
end

EENMResults.Parameters.time = Parameters.time;
EENMResults.Parameters.time2 = cell2mat(Data_S(:,3));
EENMResults.x = x;
EENMResults.Vs_S = Vs_S;
EENMResults.Vs_FR = Vs_FR;
EENMResults.Vs_FF = Vs_FF;
EENMResults.Vd_S = Vd_S;
EENMResults.Vd_FR = Vd_FR;
EENMResults.Vd_FF = Vd_FF;
EENMResults.VJN_S = VJN_S;
EENMResults.VJN_FR = VJN_FR;
EENMResults.VJN_FF = VJN_FF;
EENMResults.UMAP_S = UMAP_S;
EENMResults.UMAP_FR = UMAP_FR;
EENMResults.UMAP_FF = UMAP_FF;
EENMResults.e_S = e_S;
EENMResults.e_FR = e_FR;
EENMResults.e_FF = e_FF;
EENMResults.f_S = f_S;
EENMResults.f_FR = f_FR;
EENMResults.f_FF = f_FF;

for i=1:length(EENMResults.Parameters.time2)
    EENMResults.Vd(i) = mean(mean(EENMResults.Vd_S(i,:))+mean(EENMResults.Vd_FR(i,:))+mean(EENMResults.Vd_FF(i,:)));
    EENMResults.Vs(i) = mean(mean(EENMResults.Vs_S(i,:))+mean(EENMResults.Vs_FR(i,:))+mean(EENMResults.Vs_FF(i,:)));
    EENMResults.VJN(i) = mean(mean(EENMResults.VJN_S(i,:))+mean(EENMResults.VJN_FR(i,:))+mean(EENMResults.VJN_FF(i,:)));       
    EENMResults.force(i) = (mean(EENMResults.f_S(:,i))+mean(EENMResults.f_FR(:,i))+mean(EENMResults.f_FF(:,i)));       
    EENMResults.MFAP(i) = (mean(EENMResults.UMAP_S(i,:))+mean(EENMResults.UMAP_FR(i,:))+mean(EENMResults.UMAP_FF(i,:)));       
end
