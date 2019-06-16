function [Vs, Vd, Time]= runnn(qde,Area,Parameters, key, tspan, y0)
    Vs=zeros(length(tspan),qde);
    Vd=zeros(length(tspan),qde);
    for k=1:qde
        [t,y] = ode23s(@(t,y)rates(t,y,Area(k),Parameters, key), tspan, y0);
        Vs(:,k)=y(:,1);
        Vd(:,k)=y(:,7);
        Time = t;
    end
end



