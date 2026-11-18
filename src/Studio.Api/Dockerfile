FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY src/Studio.Api/Studio.Api.csproj src/Studio.Api/Studio.Api.csproj
COPY src/Studio.Api/packages.lock.json src/Studio.Api/packages.lock.json
RUN dotnet restore src/Studio.Api/Studio.Api.csproj
COPY src/Studio.Api/ src/Studio.Api/
RUN dotnet publish src/Studio.Api/Studio.Api.csproj -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
RUN mkdir -p /keys && chown app:app /keys
USER app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Studio.Api.dll"]
