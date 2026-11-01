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
# DataProtection の鍵の置き場所（NexusInfra #8）。本番はここに私有の volume を載せる。
# 新しい named volume はこの所有者と 0700 を引き継ぐ。
RUN mkdir -p /var/lib/nexus-studio/dataprotection-keys \
    && chown "$APP_UID" /var/lib/nexus-studio/dataprotection-keys \
    && chmod 700 /var/lib/nexus-studio/dataprotection-keys
USER $APP_UID
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["/app/healthcheck"]
ENTRYPOINT ["dotnet", "StudioApi.dll"]
