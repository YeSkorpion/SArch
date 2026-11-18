using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Studio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProjectPresence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "content_revision",
                table: "projects",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "project_presences",
                columns: table => new
                {
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    label = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    artifact_id = table.Column<Guid>(type: "uuid", nullable: true),
                    seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_project_presences", x => new { x.project_id, x.user_id });
                    table.ForeignKey(
                        name: "fk_project_presences_asp_net_users_user_id",
                        column: x => x.user_id,
                        principalTable: "AspNetUsers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_project_presences_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_project_presences_project_id_seen_at",
                table: "project_presences",
                columns: new[] { "project_id", "seen_at" });

            migrationBuilder.CreateIndex(
                name: "ix_project_presences_user_id",
                table: "project_presences",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_presences");

            migrationBuilder.DropColumn(
                name: "content_revision",
                table: "projects");
        }
    }
}
