function [Spike] = detectSpike(Vs)
%     FreqSpike=zeros(size(Vs,1),1);
    Spike=zeros(size(Vs,1),size(Vs,2)); 
    for k=1:size(Vs,2)
        [ValPeak, LocPeak] = findpeaks(Vs(:,k),'MinPeakHeight',0);
        for j=1:length(LocPeak)
%             FreqSpike(LocPeak(j),1)=1000/(tspan(LocPeak(j+1))-tspan(LocPeak(j)));
            Spike(LocPeak(j))=ValPeak(j);
        end 
    end
end

