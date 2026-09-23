using System.Text.Json;
using NetTopologySuite.Algorithm;
using NetTopologySuite.Geometries;

namespace StudioApi.Services.MapValidation;

internal static class DatasetGeometry
{
    private static readonly GeometryFactory Factory = new(new PrecisionModel(), 4326);
    public static Geometry Read(JsonElement geometry)
    {
        var coordinates = geometry.GetProperty("coordinates");
        return geometry.GetProperty("type").GetString() switch
        {
            "Point" => Factory.CreatePoint(Position(coordinates)),
            "LineString" => Factory.CreateLineString(coordinates.EnumerateArray().Select(Position).ToArray()),
            "Polygon" => Polygon(coordinates),
            _ => throw new ArgumentException("Only Point, LineString and Polygon are supported.")
        };
    }

    private static Coordinate Position(JsonElement position)
    {
        if (position.GetArrayLength() != 2) throw new ArgumentException("Position must have two ordinates.");
        var x = position[0].GetDouble();
        var y = position[1].GetDouble();
        if (!double.IsFinite(x) || !double.IsFinite(y) || x < -180 || x > 180 || y < -90 || y > 90)
            throw new ArgumentException("Position outside CRS84 range.");
        return new(x, y);
    }

    private static Polygon Polygon(JsonElement coordinates)
    {
        var rings = coordinates.EnumerateArray().Select(r => Factory.CreateLinearRing(r.EnumerateArray().Select(Position).ToArray())).ToArray();
        if (rings.Length == 0) throw new ArgumentException("Polygon is empty.");
        return Factory.CreatePolygon(rings[0], rings.Skip(1).ToArray());
    }

    public static bool CorrectOrientation(Polygon polygon) => Orientation.IsCCW(polygon.ExteriorRing.Coordinates)
        && Enumerable.Range(0, polygon.NumInteriorRings).All(i => !Orientation.IsCCW(polygon.GetInteriorRingN(i).Coordinates));

    // WGS84 ECEF -> common local ENU plane. An origin is required; no survey anchor is invented.
    public static double Distance(Coordinate first, Coordinate second, GeoOrigin origin)
    {
        var a = Enu(first, origin);
        var b = Enu(second, origin);
        return Math.Sqrt(Math.Pow(a.E - b.E, 2) + Math.Pow(a.N - b.N, 2));
    }

    private static (double E, double N) Enu(Coordinate point, GeoOrigin origin)
    {
        const double semiMajor = 6378137;
        const double eccentricitySquared = 6.6943799901413165e-3;
        var longitude = point.X * Math.PI / 180;
        var latitude = point.Y * Math.PI / 180;
        var n = semiMajor / Math.Sqrt(1 - eccentricitySquared * Math.Pow(Math.Sin(latitude), 2));
        var x = n * Math.Cos(latitude) * Math.Cos(longitude);
        var y = n * Math.Cos(latitude) * Math.Sin(longitude);
        var z = n * (1 - eccentricitySquared) * Math.Sin(latitude);
        var lon0 = origin.Longitude * Math.PI / 180;
        var lat0 = origin.Latitude * Math.PI / 180;
        // Translation cancels in the pairwise distance, so project both ECEF vectors directly.
        return (-Math.Sin(lon0) * x + Math.Cos(lon0) * y,
            -Math.Sin(lat0) * Math.Cos(lon0) * x - Math.Sin(lat0) * Math.Sin(lon0) * y + Math.Cos(lat0) * z);
    }
}
