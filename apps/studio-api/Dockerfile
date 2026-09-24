FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY apps/studio-api/ apps/studio-api/
COPY docs/schemas/ docs/schemas/
RUN dotnet restore apps/studio-api/StudioApi.csproj
RUN dotnet publish apps/studio-api/StudioApi.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 8080
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
COPY deploy/healthcheck.sh /app/healthcheck
RUN chmod 755 /app/healthcheck
USER $APP_UID
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["/app/healthcheck"]
ENTRYPOINT ["dotnet", "StudioApi.dll"]
